import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from src.bau.store import BauItem, BauStore


class ScreenshotCapture:
    """Captura a tela inteira e guarda no Baú.

    Windows e Linux X11 usam `mss`. No Linux Wayland, onde o `mss` não funciona,
    usa a primeira ferramenta disponível: grim, gnome-screenshot ou spectacle.
    """

    def __init__(self, store: BauStore):
        self.store = store

    def take_screenshot(self) -> BauItem:
        png = self._capture_png()
        item = self.store.save("image", png, source="screenshot")
        if item is None:
            raise RuntimeError("Captura de tela excede o tamanho máximo permitido")
        return item

    def _capture_png(self) -> bytes:
        if os.environ.get("WAYLAND_DISPLAY"):
            return self._capture_wayland()

        import mss
        import mss.tools

        with mss.mss() as sct:
            shot = sct.grab(sct.monitors[0])
            return mss.tools.to_png(shot.rgb, shot.size)

    @staticmethod
    def _capture_wayland() -> bytes:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "screenshot.png"
            commands = [
                ["grim", str(target)],
                ["gnome-screenshot", "-f", str(target)],
                ["spectacle", "-b", "-n", "-o", str(target)],
            ]
            for command in commands:
                if shutil.which(command[0]) is None:
                    continue
                result = subprocess.run(command, capture_output=True, timeout=15)
                if result.returncode == 0 and target.exists():
                    return target.read_bytes()
        raise RuntimeError("Nenhuma ferramenta de captura encontrada no Wayland (instale grim, gnome-screenshot ou spectacle)")
