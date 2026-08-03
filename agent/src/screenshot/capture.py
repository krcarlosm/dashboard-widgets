import time
from pathlib import Path


class ScreenshotCapture:
    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def take_screenshot(self) -> Path:
        try:
            import mss
            import mss.tools
        except Exception as exc:
            raise RuntimeError("mss is not installed") from exc

        with mss.mss() as sct:
            monitor = sct.monitors[0]
            img = sct.grab(monitor)
            output_dir = self.storage_dir / "imagens"
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / f"screenshot_{int(time.time())}.png"
            mss.tools.to_png(img.rgb, img.size, output=str(output_path))
            return output_path
