import os
from pathlib import Path
from typing import Iterable

# Arquivos temporários, de bloqueio e de download em andamento nunca entram no Top 10.
EXCLUDED_PREFIXES = ("~$", ".~lock", "~wr", ".#")
EXCLUDED_SUFFIXES = (
    ".tmp", ".temp", ".crdownload", ".part", ".partial", ".download",
    ".swp", ".swo", ".lnk", ".url", "~",
)
EXCLUDED_NAMES = {"desktop.ini", "thumbs.db", ".ds_store"}
EXCLUDED_DIRS = {"node_modules", "__pycache__", "$recycle.bin", ".git", ".venv", ".svn", "site-packages"}
# Metadados gerados por ferramentas de pacotes Python.
EXCLUDED_DIR_SUFFIXES = (".egg-info", ".dist-info")

# Abrir estes tipos pelo dashboard executaria um programa: o agente só mostra na pasta.
EXECUTABLE_SUFFIXES = (
    ".exe", ".bat", ".cmd", ".com", ".msi", ".ps1", ".vbs", ".vbe", ".js", ".jse",
    ".wsf", ".scr", ".pif", ".hta", ".cpl", ".reg", ".sh", ".desktop", ".appimage",
)


def is_excluded_name(path: str) -> bool:
    name = os.path.basename(path).lower()
    if not name or name in EXCLUDED_NAMES:
        return True
    if name.startswith(EXCLUDED_PREFIXES) or name.endswith(EXCLUDED_SUFFIXES):
        return True
    parts = Path(path).parts[:-1]
    # Pastas ocultas (".algo") e de ferramentas, exceto a raiz/unidade.
    return any(
        part.lower() in EXCLUDED_DIRS or part.lower().endswith(EXCLUDED_DIR_SUFFIXES) or (part.startswith(".") and len(part) > 1)
        for part in parts
    )


def is_under(path: str, roots: Iterable[Path]) -> bool:
    key = os.path.normcase(os.path.abspath(path))
    for root in roots:
        root_key = os.path.normcase(os.path.abspath(root))
        if key == root_key or key.startswith(root_key.rstrip("\\/") + os.sep):
            return True
    return False


def is_executable(path: str) -> bool:
    return path.lower().endswith(EXECUTABLE_SUFFIXES)
