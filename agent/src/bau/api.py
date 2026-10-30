import asyncio
from typing import Awaitable, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from src.bau.settings import BauSettings
from src.bau.store import BauStore
from src.clipboard.monitor import ClipboardMonitor
from src.retention.purge import PurgeService


class RetentionPayload(BaseModel):
    retentionHours: int


def create_bau_router(
    store: BauStore,
    settings: BauSettings,
    monitor: ClipboardMonitor,
    purge_service: PurgeService,
    broadcast: Callable[[dict], Awaitable[None]],
    require_token: Callable,
) -> APIRouter:
    router = APIRouter(prefix="/bau", dependencies=[Depends(require_token)])

    def not_found() -> HTTPException:
        return HTTPException(status_code=404, detail="Item não encontrado no Baú")

    @router.get("/items")
    async def list_items(
        kind: Optional[str] = Query(default=None, pattern="^(text|image)$"),
        q: Optional[str] = Query(default=None, max_length=200),
        limit: int = Query(default=50, ge=1, le=500),
    ):
        items = await asyncio.to_thread(store.list_items, kind, q, limit)
        return {"items": items, "counts": store.counts(), **settings.to_dict()}

    @router.get("/items/{item_id}/content")
    async def item_content(item_id: str):
        text = store.read_text(item_id)
        if text is not None:
            return {"text": text}
        image = store.image_path(item_id)
        if image is None:
            raise not_found()
        return FileResponse(image, media_type="image/png")

    @router.get("/items/{item_id}/thumbnail")
    async def item_thumbnail(item_id: str):
        thumb = await asyncio.to_thread(store.thumbnail_path, item_id)
        if thumb is None:
            raise not_found()
        return FileResponse(thumb, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})

    @router.post("/items/{item_id}/copy")
    async def copy_item(item_id: str):
        try:
            copied = await asyncio.to_thread(monitor.copy_item_to_clipboard, item_id)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Não foi possível copiar: {exc}") from exc
        if not copied:
            raise not_found()
        return {"copied": item_id}

    @router.delete("/items/{item_id}")
    async def delete_item(item_id: str):
        if not store.delete(item_id):
            raise not_found()
        await broadcast({"type": "bau:items-removed", "payload": {"ids": [item_id]}})
        return {"removed": [item_id]}

    @router.delete("/items")
    async def clear_items(kind: Optional[str] = Query(default=None, pattern="^(text|image)$")):
        removed = store.clear(kind)
        if removed:
            await broadcast({"type": "bau:items-removed", "payload": {"ids": removed}})
        return {"removed": removed}

    @router.get("/settings")
    async def get_settings():
        return settings.to_dict()

    @router.put("/settings")
    async def update_settings(payload: RetentionPayload):
        try:
            settings.set_retention_hours(payload.retentionHours)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await purge_service.run_once()
        result = settings.to_dict()
        await broadcast({"type": "bau:settings", "payload": result})
        return result

    return router
