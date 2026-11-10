import json
import os
from pathlib import Path
from typing import Optional

from src.system.userdirs import downloads_dir


def default_media_dir() -> Path:
    override = os.environ.get("DASHBOARD_MEDIA_DIR")
    if override:
        return Path(override)
    return downloads_dir() / "Dashboard"


class MediaSettings:
    """Pastas de saída do Downloader e do Conversor (`media_settings.json`)."""

    KEYS = ("downloadDir", "convertDir")

    def __init__(self, agent_home: Path):
        self.path = agent_home / "media_settings.json"

    def _load(self) -> dict:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _dir(self, key: str) -> Path:
        value = self._load().get(key)
        return Path(value) if isinstance(value, str) and value else default_media_dir()

    @property
    def download_dir(self) -> Path:
        return self._dir("downloadDir")

    @property
    def convert_dir(self) -> Path:
        return self._dir("convertDir")

    def ensure(self, key: str) -> Path:
        directory = self._dir(key)
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    def update(self, download_dir: Optional[str] = None, convert_dir: Optional[str] = None) -> None:
        data = self._load()
        for key, value in (("downloadDir", download_dir), ("convertDir", convert_dir)):
            if value is None:
                continue
            value = value.strip()
            if not value:
                data.pop(key, None)  # vazio volta ao padrão
                continue
            path = Path(os.path.expandvars(os.path.expanduser(value)))
            if not path.is_absolute():
                raise ValueError("Informe o caminho completo da pasta (ex.: C:\\Users\\voce\\Videos).")
            if path.exists() and not path.is_dir():
                raise ValueError(f"{path} não é uma pasta.")
            try:
                path.mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                raise ValueError(f"Não foi possível criar a pasta {path}: {exc}") from exc
            data[key] = str(path)
        self.path.write_text(json.dumps(data), encoding="utf-8")

    def to_dict(self) -> dict:
        return {"downloadDir": str(self.download_dir), "convertDir": str(self.convert_dir), "defaultDir": str(default_media_dir())}
