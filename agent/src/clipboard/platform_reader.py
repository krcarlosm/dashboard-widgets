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

        # Try Text first via win32clipboard
        try:
            win32clipboard.OpenClipboard()
            try:
                if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_UNICODETEXT):
                    data = win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)
                    return ClipboardContent(kind="text", data=data.encode("utf-8"), text=data, hash_value=None)
            finally:
                win32clipboard.CloseClipboard()
        except Exception:
            pass
            
        # Try Image via Pillow
        try:
            from PIL import ImageGrab
            import io
            img = ImageGrab.grabclipboard()
            if img is not None:
                # If it's a list (e.g. copied files), we ignore for now, we want a single image
                if not isinstance(img, list):
                    buf = io.BytesIO()
                    img.save(buf, format='PNG')
                    return ClipboardContent(kind="image", data=buf.getvalue(), hash_value=None)
        except Exception:
            pass

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
