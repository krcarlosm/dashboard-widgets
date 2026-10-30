import os
import subprocess
import sys
from pathlib import Path


def open_file(path: str) -> None:
    """Abre o arquivo no aplicativo padrão do sistema."""
    if sys.platform == "win32":
        os.startfile(path)
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def reveal_file(path: str) -> None:
    """Abre a pasta do arquivo com ele selecionado."""
    if sys.platform == "win32":
        subprocess.Popen(f'explorer /select,"{path}"')
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R", path])
    else:
        # Nautilus, Dolphin, Nemo etc. implementam FileManager1; senão, abre só a pasta.
        uri = Path(path).as_uri()
        try:
            result = subprocess.run(
                [
                    "dbus-send", "--session", "--print-reply", "--dest=org.freedesktop.FileManager1",
                    "/org/freedesktop/FileManager1", "org.freedesktop.FileManager1.ShowItems",
                    f"array:string:{uri}", "string:",
                ],
                capture_output=True,
                timeout=5,
            )
            if result.returncode == 0:
                return
        except Exception:
            pass
        subprocess.Popen(["xdg-open", os.path.dirname(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
