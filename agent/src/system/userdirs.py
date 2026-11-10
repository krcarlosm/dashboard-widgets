import os
import subprocess
import sys
from pathlib import Path
from typing import Optional


def linux_user_dir(key: str) -> Optional[Path]:
    """Pasta do usuário no Linux (XDG): DOCUMENTS, DOWNLOAD… já traduzida ("Documentos", "Downloads")."""
    try:
        result = subprocess.run(["xdg-user-dir", key], capture_output=True, text=True, timeout=3)
        value = result.stdout.strip()
        # xdg-user-dir devolve a própria home quando a pasta não está configurada.
        if result.returncode == 0 and value and Path(value) != Path.home():
            return Path(value)
    except Exception:
        pass

    config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "user-dirs.dirs"
    try:
        for line in config.read_text(encoding="utf-8").splitlines():
            if line.startswith(f"XDG_{key}_DIR="):
                value = line.split("=", 1)[1].strip().strip('"').replace("$HOME", str(Path.home()))
                if value and Path(value) != Path.home():
                    return Path(value)
    except Exception:
        pass
    return None


def downloads_dir() -> Path:
    if sys.platform.startswith("linux"):
        return linux_user_dir("DOWNLOAD") or (Path.home() / "Downloads")
    return Path.home() / "Downloads"
