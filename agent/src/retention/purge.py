import asyncio
import logging
from typing import Awaitable, Callable, Optional

from src.bau.settings import BauSettings
from src.bau.store import BauStore

PURGE_INTERVAL_SECONDS = 15 * 60


class PurgeService:
    """Remove do Baú os itens mais antigos que a retenção configurada (padrão: 72h)."""

    def __init__(self, store: BauStore, settings: BauSettings, on_removed: Optional[Callable[[list[str]], Awaitable[None]]] = None):
        self.store = store
        self.settings = settings
        self.on_removed = on_removed
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

    async def run_once(self) -> list[str]:
        removed = self.store.purge_older_than(self.settings.retention_hours)
        if removed:
            self.logger.info("Expurgo concluído com %s arquivo(s) removido(s)", len(removed))
            if self.on_removed:
                await self.on_removed(removed)
        return removed

    async def _loop(self) -> None:
        while self._running:
            try:
                await self.run_once()
            except Exception:
                self.logger.exception("Falha no expurgo do Baú")
            await asyncio.sleep(PURGE_INTERVAL_SECONDS)
