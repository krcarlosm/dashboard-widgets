import io
import logging
import os
import platform
import shutil
import subprocess
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger("LocalAgent.Clipboard")


@dataclass
class ClipboardContent:
    kind: str  # 'text' | 'image'
    data: bytes  # texto em UTF-8 ou imagem em PNG
    text: Optional[str] = None


class ClipboardReader(ABC):
    @abstractmethod
    def has_changed(self) -> bool:
        """Indica se a área de transferência pode ter mudado desde a última leitura."""

    @abstractmethod
    def read(self) -> Optional[ClipboardContent]:
        """Lê o conteúdo atual; retorna None quando vazio, não suportado ou marcado como privado."""


class ClipboardWriter(ABC):
    @abstractmethod
    def write_text(self, text: str) -> None: ...

    @abstractmethod
    def write_image(self, png_bytes: bytes) -> None: ...


def _png_bytes(image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


# ── Windows ──────────────────────────────────────────────────────────────────
# Gerenciadores de senha marcam o conteúdo com estes formatos para que
# históricos de área de transferência o ignorem.
WINDOWS_PRIVATE_FORMATS = ("ExcludeClipboardContentFromMonitorProcessing", "Clipboard Viewer Ignore")
WINDOWS_HISTORY_FORMAT = "CanIncludeInClipboardHistory"


class _WindowsClipboard:
    @staticmethod
    def open(owner: Optional[int] = None, retries: int = 5) -> None:
        import win32clipboard

        for attempt in range(retries):
            try:
                win32clipboard.OpenClipboard(owner)
                return
            except Exception:
                if attempt == retries - 1:
                    raise
                time.sleep(0.05)

    @staticmethod
    def write(clipboard_format: int, data) -> None:
        """Escreve um formato na área de transferência.

        Esvaziar a área de transferência sem uma janela dona faz o SetClipboardData
        falhar de forma intermitente (erro 998). Uma janela invisível temporária é
        usada como dona e destruída em seguida, como faz o pyperclip; assim nenhuma
        mensagem fica pendente para uma janela sem laço de mensagens.
        """
        import win32clipboard
        import win32gui

        hwnd = win32gui.CreateWindowEx(0, "STATIC", None, 0, 0, 0, 0, 0, 0, 0, 0, None)
        try:
            _WindowsClipboard.open(owner=hwnd)
            try:
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardData(clipboard_format, data)
            finally:
                win32clipboard.CloseClipboard()
        finally:
            win32gui.DestroyWindow(hwnd)


class WindowsClipboardReader(ClipboardReader):
    def __init__(self) -> None:
        self._last_sequence: Optional[int] = None

    def has_changed(self) -> bool:
        import win32clipboard

        sequence = win32clipboard.GetClipboardSequenceNumber()
        if sequence == self._last_sequence:
            return False
        self._last_sequence = sequence
        return True

    @staticmethod
    def _is_private() -> bool:
        import win32clipboard

        for name in WINDOWS_PRIVATE_FORMATS:
            if win32clipboard.IsClipboardFormatAvailable(win32clipboard.RegisterClipboardFormat(name)):
                return True
        history_format = win32clipboard.RegisterClipboardFormat(WINDOWS_HISTORY_FORMAT)
        if win32clipboard.IsClipboardFormatAvailable(history_format):
            value = win32clipboard.GetClipboardData(history_format)
            if isinstance(value, (bytes, bytearray)) and value[:4] == b"\x00\x00\x00\x00":
                return True
        return False

    def read(self) -> Optional[ClipboardContent]:
        try:
            return self._read()
        except Exception:
            # Área de transferência ocupada por outro programa: tenta de novo no próximo ciclo.
            self._last_sequence = None
            raise

    def _read(self) -> Optional[ClipboardContent]:
        import win32clipboard

        _WindowsClipboard.open()
        try:
            if self._is_private():
                return None
            if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_UNICODETEXT):
                text = win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)
                if text:
                    return ClipboardContent(kind="text", data=text.encode("utf-8"), text=text)
            has_image = win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_DIB)
        finally:
            win32clipboard.CloseClipboard()

        if has_image:
            from PIL import ImageGrab

            image = ImageGrab.grabclipboard()
            # Arquivos copiados no Explorer chegam como lista de caminhos: ignorados.
            if image is not None and not isinstance(image, list):
                return ClipboardContent(kind="image", data=_png_bytes(image))
        return None


class WindowsClipboardWriter(ClipboardWriter):
    def write_text(self, text: str) -> None:
        import win32clipboard

        # Bytes UTF-16 explícitos: passando `str`, o pywin32 trata textos só com
        # dígitos (ex.: "123456") como handle e a escrita falha com erro 998.
        _WindowsClipboard.write(win32clipboard.CF_UNICODETEXT, (text + "\0").encode("utf-16-le"))

    def write_image(self, png_bytes: bytes) -> None:
        import win32clipboard
        from PIL import Image

        with Image.open(io.BytesIO(png_bytes)) as image:
            buffer = io.BytesIO()
            image.convert("RGB").save(buffer, format="BMP")
        dib = buffer.getvalue()[14:]  # CF_DIB = BMP sem o cabeçalho de arquivo
        _WindowsClipboard.write(win32clipboard.CF_DIB, dib)


# ── Linux (Wayland: wl-clipboard · X11: xclip) ───────────────────────────────
LINUX_TEXT_TYPES = ("text/plain;charset=utf-8", "UTF8_STRING", "text/plain")
LINUX_PRIVATE_TYPE = "x-kde-passwordManagerHint"


def _use_wayland() -> bool:
    return bool(os.environ.get("WAYLAND_DISPLAY")) and shutil.which("wl-paste") is not None


class LinuxClipboardReader(ClipboardReader):
    def __init__(self) -> None:
        self._warned = False

    def has_changed(self) -> bool:
        # Sem número de sequência no Linux: a deduplicação por hash evita gravações repetidas.
        return True

    @staticmethod
    def _run(args: list[str]) -> Optional[bytes]:
        try:
            result = subprocess.run(args, capture_output=True, timeout=2)
        except (OSError, subprocess.TimeoutExpired):
            return None
        return result.stdout if result.returncode == 0 else None

    def _list_types(self) -> Optional[list[str]]:
        if _use_wayland():
            raw = self._run(["wl-paste", "--list-types"])
        elif shutil.which("xclip"):
            raw = self._run(["xclip", "-selection", "clipboard", "-t", "TARGETS", "-o"])
        else:
            if not self._warned:
                logger.warning("Instale wl-clipboard (Wayland) ou xclip (X11) para monitorar a área de transferência.")
                self._warned = True
            return None
        return raw.decode("utf-8", errors="replace").split() if raw else []

    def _fetch(self, mime: str) -> Optional[bytes]:
        if _use_wayland():
            return self._run(["wl-paste", "--no-newline", "--type", mime])
        return self._run(["xclip", "-selection", "clipboard", "-t", mime, "-o"])

    def read(self) -> Optional[ClipboardContent]:
        types = self._list_types()
        if not types or LINUX_PRIVATE_TYPE in types:
            return None

        text_type = next((t for t in LINUX_TEXT_TYPES if t in types), None)
        if text_type:
            data = self._fetch(text_type)
            if data:
                text = data.decode("utf-8", errors="replace")
                return ClipboardContent(kind="text", data=text.encode("utf-8"), text=text)

        if "image/png" in types:
            data = self._fetch("image/png")
            if data:
                return ClipboardContent(kind="image", data=data)
        return None


class LinuxClipboardWriter(ClipboardWriter):
    @staticmethod
    def _write(mime: str, data: bytes) -> None:
        if _use_wayland() and shutil.which("wl-copy"):
            args = ["wl-copy", "--type", mime]
        elif shutil.which("xclip"):
            args = ["xclip", "-selection", "clipboard", "-t", mime, "-i"]
        else:
            raise RuntimeError("Instale wl-clipboard (Wayland) ou xclip (X11) para copiar itens do Baú.")
        subprocess.run(args, input=data, check=True, timeout=5)

    def write_text(self, text: str) -> None:
        self._write("text/plain;charset=utf-8" if _use_wayland() else "UTF8_STRING", text.encode("utf-8"))

    def write_image(self, png_bytes: bytes) -> None:
        self._write("image/png", png_bytes)


def get_reader() -> ClipboardReader:
    if platform.system() == "Windows":
        return WindowsClipboardReader()
    return LinuxClipboardReader()


def get_writer() -> ClipboardWriter:
    if platform.system() == "Windows":
        return WindowsClipboardWriter()
    return LinuxClipboardWriter()
