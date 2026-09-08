import platform
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class ClipboardContent:
    kind: str
    data: bytes
    text: Optional[str] = None
    hash_value: Optional[str] = None


class ClipboardReader(ABC):
    @abstractmethod
    def read(self) -> Optional[ClipboardContent]:
        raise NotImplementedError


class WindowsClipboardReader(ClipboardReader):
    def read(self) -> Optional[ClipboardContent]:
        try:
            import win32clipboard
        except Exception:
            return None

        try:
            win32clipboard.OpenClipboard()
            try:
                if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_UNICODETEXT):
                    data = win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)
                    return ClipboardContent(kind="text", data=data.encode("utf-8"), text=data, hash_value=None)

                if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_DIB):
                    data = win32clipboard.GetClipboardData(win32clipboard.CF_DIB)
                    return ClipboardContent(kind="image", data=data, hash_value=None)
            finally:
                win32clipboard.CloseClipboard()
        except Exception:
            return None

        return None


class LinuxClipboardReader(ClipboardReader):
    def read(self) -> Optional[ClipboardContent]:
        import subprocess
        # Tentativa 1: Wayland (wl-paste)
        try:
            res = subprocess.run(["wl-paste", "--type", "text/plain"], capture_output=True, timeout=1)
            if res.returncode == 0 and res.stdout:
                text = res.stdout.decode("utf-8", errors="replace")
                return ClipboardContent(kind="text", data=res.stdout, text=text)
        except Exception:
            pass

        # Tentativa 2: X11 (xclip)
        try:
            res = subprocess.run(["xclip", "-selection", "clipboard", "-o"], capture_output=True, timeout=1)
            if res.returncode == 0 and res.stdout:
                text = res.stdout.decode("utf-8", errors="replace")
                return ClipboardContent(kind="text", data=res.stdout, text=text)
        except Exception:
            pass

        return None


def get_reader() -> ClipboardReader:
    if platform.system() == "Windows":
        return WindowsClipboardReader()
    return LinuxClipboardReader()
