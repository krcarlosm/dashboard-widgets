import asyncio
import logging
import time
from pathlib import Path
from typing import Optional


class PurgeService:
    def __init__(self, storage_dir: Path, retention_days: int = 7):
        self.storage_dir = storage_dir
        self.retention_days = retention_days
        self.logger = logging.getLogger("LocalAgent.Purge")
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _loop(self) -> None:
        while self._running:
            removed = self._purge()
            if removed:
                self.logger.info("Expurgo concluído com %s arquivo(s) removido(s)", len(removed))
            await asyncio.sleep(6 * 60 * 60)

    def _purge(self) -> list[str]:
        cutoff = time.time() - (self.retention_days * 24 * 60 * 60)
        removed: list[str] = []
        for folder_name in ("imagens", "textos"):
            folder = self.storage_dir / folder_name
            if not folder.exists():
                continue
            for file_path in folder.iterdir():
                if file_path.is_file() and file_path.stat().st_mtime < cutoff:
                    file_path.unlink(missing_ok=True)
                    removed.append(str(file_path))
        return removed
