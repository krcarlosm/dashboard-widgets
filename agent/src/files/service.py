import asyncio
import logging
import os
import time
from pathlib import Path
from typing import Awaitable, Callable, Iterable, Optional

from src.files.filters import is_excluded_name, is_under
from src.files.recent import get_recent_reader
from src.files.store import ActivityStore
from src.files.watcher import FolderSettings, FolderWatcher

logger = logging.getLogger("LocalAgent")

SCAN_INTERVAL_SECONDS = 120
NOTIFY_INTERVAL_SECONDS = 5
PURGE_INTERVAL_SECONDS = 6 * 3600


class FileActivityService:
    """Alimenta o Top 10 da semana com arquivos abertos e editados.

    - Abertos: a cada 2 min lê os "recentes" do sistema (ver recent.py).
    - Editados: a data de modificação dos arquivos com atividade na semana é
      comparada a cada varredura; pastas monitoradas (opcionais) avisam na hora.
    """

    def __init__(
        self,
        store: ActivityStore,
        folder_settings: FolderSettings,
        broadcast: Callable[[dict], Awaitable[None]],
        excluded_roots: Iterable[Path] = (),
        reader=None,
    ):
        self.store = store
        self.folder_settings = folder_settings
        self.broadcast = broadcast
        self.excluded_roots = list(excluded_roots)
        self.reader = reader if reader is not None else get_recent_reader()
        self.watcher = FolderWatcher(self._on_folder_edit)
        self._tasks: list[asyncio.Task] = []
        self._dirty = False
        self._last_purge = 0.0
        self._scan_lock = asyncio.Lock()

    def accepts(self, path: str) -> bool:
        return bool(path) and not is_excluded_name(path) and not is_under(path, self.excluded_roots) and os.path.isfile(path)

    def _on_folder_edit(self, path: str, ts: float) -> None:
        # Chamado na thread do watchdog.
        if not self.accepts(path):
            return
        self.store.record(path, "edited", ts)
        try:
            self.store.set_known_mtime(path, os.path.getmtime(path))
        except OSError:
            pass
        self._dirty = True

    def scan_once(self) -> int:
        """Varredura síncrona (rodar em thread). Devolve quantos eventos novos entraram."""
        added = 0

        if self.reader is not None:
            try:
                opened = self.reader.read_new(self.store)
            except Exception:
                logger.exception("Falha ao ler arquivos recentes do sistema")
                opened = []
            for path, ts in opened:
                if not self.accepts(path):
                    continue
                added += self.store.record(path, "opened", ts)
                if self.store.known_mtime(path) is None:
                    try:
                        mtime = os.path.getmtime(path)
                    except OSError:
                        continue
                    self.store.set_known_mtime(path, mtime)
                    # Salvo depois de aberto: é uma edição. Um PDF baixado (mtime
                    # anterior à abertura) não conta.
                    if mtime > ts + 1:
                        added += self.store.record(path, "edited", mtime)

        for path in self.store.recent_paths():
            try:
                mtime = os.path.getmtime(path)
            except OSError:
                continue
            known = self.store.known_mtime(path)
            if known is None:
                self.store.set_known_mtime(path, mtime)
            elif mtime > known + 1:
                self.store.set_known_mtime(path, mtime)
                added += self.store.record(path, "edited", mtime)

        if time.time() - self._last_purge > PURGE_INTERVAL_SECONDS:
            self._last_purge = time.time()
            self.store.purge()

        if added:
            self._dirty = True
        return added

    async def scan(self) -> int:
        async with self._scan_lock:
            added = await asyncio.to_thread(self.scan_once)
        await self._flush()
        return added

    async def _flush(self) -> None:
        if self._dirty:
            self._dirty = False
            await self.broadcast({"type": "files:updated", "payload": {}})

    async def _scan_loop(self) -> None:
        while True:
            try:
                await self.scan()
            except Exception:
                logger.exception("Falha na varredura de arquivos")
            await asyncio.sleep(SCAN_INTERVAL_SECONDS)

    async def _notify_loop(self) -> None:
        while True:
            await asyncio.sleep(NOTIFY_INTERVAL_SECONDS)
            await self._flush()

    def folders(self) -> list[str]:
        return self.folder_settings.load()

    def set_folders(self, folders: list[str]) -> list[str]:
        saved = self.folder_settings.save(folders)
        self.watcher.configure(saved)
        return saved

    async def start(self) -> None:
        await asyncio.to_thread(self.watcher.configure, self.folders())
        self._tasks = [asyncio.create_task(self._scan_loop()), asyncio.create_task(self._notify_loop())]

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        self._tasks = []
        await asyncio.to_thread(self.watcher.stop)
