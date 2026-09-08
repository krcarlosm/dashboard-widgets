import asyncio
import hashlib
import time
from pathlib import Path
from typing import Awaitable, Callable, Optional

from src.clipboard.platform_reader import ClipboardContent, get_reader


class ClipboardMonitor:
    def __init__(self, storage_dir: Path, broadcast_fn: Callable[[dict], Awaitable[None]]):
        self.storage_dir = storage_dir
        self.broadcast_fn = broadcast_fn
        self._running = False
        self._paused = False
        self._task: Optional[asyncio.Task] = None

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
        reader = get_reader()
        last_hash: Optional[str] = None
        while self._running:
            if self._paused:
                await asyncio.sleep(0.8)
                continue

            try:
                content = reader.read()
                if content:
                    content_hash = self._hash_content(content)
                    if content_hash != last_hash:
                        last_hash = content_hash
                        saved_path = self._save_content(content)
                        if saved_path is not None:
                            await self.broadcast_fn({
                                "type": "clipboard:event",
                                "payload": {
                                    "kind": content.kind,
                                    "path": str(saved_path),
                                    "timestamp": int(time.time()),
                                },
                            })
            except Exception as exc:
                # Logar exceções do leitor sem derrubar a execução do monitor
                pass

            await asyncio.sleep(0.8)

    def _hash_content(self, content: ClipboardContent) -> str:
        return hashlib.sha256(content.data).hexdigest()

    def _save_content(self, content: ClipboardContent) -> Optional[Path]:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        folder_name = "imagens" if content.kind == "image" else "textos"
        folder_path = self.storage_dir / folder_name
        folder_path.mkdir(parents=True, exist_ok=True)

        extension = ".png" if content.kind == "image" else ".txt"
        filename = f"clipboard_{int(time.time())}{extension}"
        target_path = folder_path / filename

        if content.kind == "text" and content.text is not None:
            target_path.write_text(content.text, encoding="utf-8")
        else:
            target_path.write_bytes(content.data)

        return target_path
