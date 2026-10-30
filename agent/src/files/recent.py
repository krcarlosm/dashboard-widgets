"""Arquivos abertos recentemente, lidos do próprio sistema operacional.

- Windows: atalhos em %APPDATA%\\Microsoft\\Windows\\Recent. O Explorer e os
  aplicativos atualizam o atalho a cada abertura, então a data de modificação
  do .lnk é a data da última abertura.
- Linux: ~/.local/share/recently-used.xbel (GTK/GNOME, KDE e a maioria dos apps).

Cada leitor devolve só o que mudou desde a última leitura, usando a tabela
`recent_seen` como marcador.
"""

import logging
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

from src.files.store import WINDOW_DAYS, ActivityStore

logger = logging.getLogger("LocalAgent")


class WindowsRecentReader:
    PREFIX = "win:"

    def __init__(self, recent_dir: Optional[Path] = None):
        appdata = os.environ.get("APPDATA", "")
        self.recent_dir = recent_dir or Path(appdata) / "Microsoft" / "Windows" / "Recent"

    @staticmethod
    def _resolve(link_path: str) -> Optional[str]:
        import pythoncom
        from win32com.shell import shell

        link = pythoncom.CoCreateInstance(shell.CLSID_ShellLink, None, pythoncom.CLSCTX_INPROC_SERVER, shell.IID_IShellLink)
        link.QueryInterface(pythoncom.IID_IPersistFile).Load(link_path)
        target = link.GetPath(shell.SLGP_RAWPATH)[0]
        return target or None

    def read_new(self, store: ActivityStore) -> list[tuple[str, float]]:
        if not self.recent_dir.is_dir():
            return []
        import pythoncom

        seen = store.seen_sources(self.PREFIX)
        since = time.time() - WINDOW_DAYS * 86400
        opened: list[tuple[str, float]] = []
        marks: list[tuple[str, float]] = []

        pythoncom.CoInitialize()
        try:
            for entry in os.scandir(self.recent_dir):
                if not entry.name.lower().endswith(".lnk"):
                    continue
                try:
                    mtime = entry.stat().st_mtime
                except OSError:
                    continue
                source = self.PREFIX + entry.name.lower()
                if seen.get(source, 0) >= mtime - 1:
                    continue
                marks.append((source, mtime))
                if mtime < since:
                    continue  # primeira leitura: aberturas antigas ficam fora da janela
                try:
                    target = self._resolve(entry.path)
                except Exception:
                    continue
                if target:
                    opened.append((target, mtime))
        finally:
            pythoncom.CoUninitialize()

        store.mark_seen(marks)
        return opened


class XbelRecentReader:
    PREFIX = "xbel:"

    def __init__(self, xbel_path: Optional[Path] = None):
        data_home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
        self.xbel_path = xbel_path or data_home / "recently-used.xbel"

    @staticmethod
    def _parse_time(value: Optional[str]) -> Optional[float]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None

    def read_new(self, store: ActivityStore) -> list[tuple[str, float]]:
        if not self.xbel_path.is_file():
            return []
        try:
            root = ET.parse(self.xbel_path).getroot()
        except (ET.ParseError, OSError) as exc:
            logger.warning("Não foi possível ler %s: %s", self.xbel_path, exc)
            return []

        seen = store.seen_sources(self.PREFIX)
        since = time.time() - WINDOW_DAYS * 86400
        opened: list[tuple[str, float]] = []
        marks: list[tuple[str, float]] = []

        for bookmark in root.iter("bookmark"):
            href = bookmark.get("href", "")
            if not href.startswith("file://"):
                continue
            # O horário mais recente entre o próprio favorito e os apps que o abriram.
            stamps = [self._parse_time(bookmark.get(attr)) for attr in ("modified", "visited")]
            stamps += [self._parse_time(app.get("modified")) for app in bookmark.iter() if app.tag.endswith("application")]
            last = max((stamp for stamp in stamps if stamp), default=None)
            if last is None:
                continue
            source = self.PREFIX + href
            if seen.get(source, 0) >= last - 1:
                continue
            marks.append((source, last))
            if last >= since:
                opened.append((unquote(urlparse(href).path), last))

        store.mark_seen(marks)
        return opened


def get_recent_reader():
    if sys.platform == "win32":
        return WindowsRecentReader()
    if sys.platform.startswith("linux"):
        return XbelRecentReader()
    return None
