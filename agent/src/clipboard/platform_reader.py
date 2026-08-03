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
        return None


def get_reader() -> ClipboardReader:
    if platform.system() == "Windows":
        return WindowsClipboardReader()
    return LinuxClipboardReader()
