import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Callable

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

logger = logging.getLogger("LocalAgent")


class FolderSettings:
    """Pastas monitoradas opcionalmente para detectar edições (`watched_folders.json`)."""

    def __init__(self, agent_home: Path):
        self.path = agent_home / "watched_folders.json"

    def load(self) -> list[str]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return [str(item) for item in data] if isinstance(data, list) else []
        except Exception:
            return []

    def save(self, folders: list[str]) -> list[str]:
        cleaned: list[str] = []
        keys: set[str] = set()
        for folder in folders:
            folder = os.path.normpath(os.path.expanduser(folder.strip().strip('"')))
            if not os.path.isdir(folder):
                raise ValueError(f"Pasta não encontrada: {folder}")
            key = os.path.normcase(folder)
            if key not in keys:
                keys.add(key)
                cleaned.append(folder)
        self.path.write_text(json.dumps(cleaned, ensure_ascii=False), encoding="utf-8")
        return cleaned


class _Handler(FileSystemEventHandler):
    def __init__(self, on_change: Callable[[str], None]):
        self.on_change = on_change

    def on_any_event(self, event: FileSystemEvent) -> None:
        if event.is_directory or event.event_type not in ("created", "modified", "moved"):
            return
        path = event.dest_path if event.event_type == "moved" else event.src_path
        if path:
            self.on_change(os.fsdecode(path))


class FolderWatcher:
    """Observa pastas escolhidas pelo usuário (inotify no Linux, ReadDirectoryChangesW no Windows)."""

    # Um mesmo arquivo dispara vários eventos por gravação: um aviso a cada 30 s basta.
    DEBOUNCE_SECONDS = 30

    def __init__(self, on_edit: Callable[[str, float], None]):
        self.on_edit = on_edit
        self._observer = None
        self._last: dict[str, float] = {}
        self._lock = threading.Lock()

    def _handle(self, path: str) -> None:
        now = time.time()
        key = os.path.normcase(path)
        with self._lock:
            if now - self._last.get(key, 0) < self.DEBOUNCE_SECONDS:
                return
            self._last[key] = now
            if len(self._last) > 5000:
                self._last.clear()
        self.on_edit(path, now)

    def configure(self, folders: list[str]) -> None:
        self.stop()
        if not folders:
            return
        observer = Observer()
        handler = _Handler(self._handle)
        for folder in folders:
            try:
                observer.schedule(handler, folder, recursive=True)
            except Exception as exc:
                logger.warning("Não foi possível monitorar %s: %s", folder, exc)
        observer.daemon = True
        observer.start()
        self._observer = observer
        logger.info("Monitorando %d pasta(s) para o Top 10", len(folders))

    def stop(self) -> None:
        if self._observer is not None:
            self._observer.stop()
            self._observer.join(timeout=5)
            self._observer = None
