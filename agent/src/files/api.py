import asyncio
import os
from typing import Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from src.files import opener
from src.files.filters import is_excluded_name, is_executable
from src.files.service import FileActivityService
from src.files.store import WINDOW_DAYS, ActivityStore


class PathPayload(BaseModel):
    path: str


class FoldersPayload(BaseModel):
    folders: list[str]


def create_files_router(store: ActivityStore, service: FileActivityService, require_token: Callable) -> APIRouter:
    router = APIRouter(prefix="/files", dependencies=[Depends(require_token)])

    def existing_top(limit: int, kind: Optional[str]) -> list[dict]:
        # Busca uma margem extra: arquivos apagados, movidos ou que passaram a ser
        # excluídos (regras novas) saem da lista.
        items = [
            item for item in store.top(limit=limit * 3, kind=kind)
            if not is_excluded_name(item["path"]) and os.path.isfile(item["path"])
        ]
        return items[:limit]

    def indexed_file(path: str) -> str:
        # Só caminhos que o próprio agente registrou: impede usar o endpoint
        # para abrir qualquer arquivo da máquina.
        if not store.is_indexed(path):
            raise HTTPException(status_code=403, detail="Arquivo fora do histórico do Top 10")
        if not os.path.isfile(path):
            raise HTTPException(status_code=404, detail="Arquivo não encontrado (movido ou apagado)")
        return path

    @router.get("/top")
    async def top(
        limit: int = Query(default=10, ge=1, le=50),
        kind: Optional[str] = Query(default=None, pattern="^(opened|edited)$"),
    ):
        items = await asyncio.to_thread(existing_top, limit, kind)
        return {"items": items, "windowDays": WINDOW_DAYS, "folders": service.folders()}

    @router.post("/scan")
    async def scan():
        added = await service.scan()
        return {"added": added}

    @router.post("/open")
    async def open_file(payload: PathPayload):
        path = indexed_file(payload.path)
        try:
            if is_executable(path):
                await asyncio.to_thread(opener.reveal_file, path)
                return {"opened": False, "revealed": True}
            await asyncio.to_thread(opener.open_file, path)
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Não foi possível abrir o arquivo: {exc}")
        return {"opened": True, "revealed": False}

    @router.post("/reveal")
    async def reveal_file(payload: PathPayload):
        path = indexed_file(payload.path)
        await asyncio.to_thread(opener.reveal_file, path)
        return {"revealed": True}

    @router.get("/folders")
    async def get_folders():
        return {"folders": service.folders()}

    @router.put("/folders")
    async def put_folders(payload: FoldersPayload):
        try:
            folders = await asyncio.to_thread(service.set_folders, payload.folders)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        return {"folders": folders}

    return router
