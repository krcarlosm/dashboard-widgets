import asyncio
import logging
import time
from typing import Awaitable, Callable, Optional

from src.bau.store import BauStore, content_hash
from src.clipboard.platform_reader import get_reader, get_writer

POLL_INTERVAL_SECONDS = 0.8
# Após o próprio agente escrever na área de transferência, a mudança não vira item novo.
SELF_WRITE_GRACE_SECONDS = 2.0


class ClipboardMonitor:
    def __init__(self, store: BauStore, broadcast_fn: Callable[[dict], Awaitable[None]]):
        self.store = store
        self.broadcast_fn = broadcast_fn
        self.logger = logging.getLogger("LocalAgent.Clipboard")
        self._running = False
        self._paused = False
        self._task: Optional[asyncio.Task] = None
        self._last_hash: Optional[str] = None
        self._ignore_until = 0.0

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False

    def is_paused(self) -> bool:
        return self._paused

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        # Evita registrar de novo o conteúdo que já estava salvo antes de reiniciar.
        self._last_hash = self.store.latest_hash()
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

    def copy_item_to_clipboard(self, item_id: str) -> bool:
        """Recoloca um item do Baú na área de transferência."""
        writer = get_writer()
        self._ignore_until = time.monotonic() + SELF_WRITE_GRACE_SECONDS
        text = self.store.read_text(item_id)
        if text is not None:
            writer.write_text(text)
            return True
        image_path = self.store.image_path(item_id)
        if image_path is not None:
            writer.write_image(image_path.read_bytes())
            return True
        return False

    async def _loop(self) -> None:
        reader = get_reader()
        while self._running:
            if not self._paused:
                try:
                    if reader.has_changed():
                        content = await asyncio.to_thread(reader.read)
                        if content:
                            await self._handle(content)
                except Exception:
                    self.logger.debug("Falha ao ler a área de transferência", exc_info=True)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def _handle(self, content) -> None:
        digest = content_hash(content.kind, content.data)
        if digest == self._last_hash:
            return
        self._last_hash = digest
        if time.monotonic() < self._ignore_until:
            return

        item = self.store.save(content.kind, content.data, source="clipboard")
        if item is None:
            self.logger.info("Item da área de transferência ignorado por exceder o tamanho máximo")
            return
        await self.broadcast_fn({"type": "bau:item-added", "payload": item.to_dict()})
