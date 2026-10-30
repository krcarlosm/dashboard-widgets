import asyncio
import os
import subprocess
import sys
from datetime import datetime
from typing import Awaitable, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from src.backup.settings import BackupSettings
from src.backup.store import KEEP_AUTO_BACKUPS, BackupStore, last_slot


class ScheduleUpdate(BaseModel):
    enabled: Optional[bool] = None
    time: Optional[str] = None


def create_backup_router(
    store: BackupStore,
    settings: BackupSettings,
    broadcast: Callable[[dict], Awaitable[None]],
    require_token: Callable,
) -> APIRouter:
    router = APIRouter(prefix="/backups", dependencies=[Depends(require_token)])

    def status() -> dict:
        now = datetime.now()
        slot = last_slot(now, *settings.hour_minute)
        last_auto = store.last_backup_at("auto")
        last_manual = store.last_backup_at("manual")
        return {
            **settings.to_dict(),
            "directory": str(store.directory),
            "keepAuto": KEEP_AUTO_BACKUPS,
            "lastAuto": last_auto.isoformat(timespec="seconds") if last_auto else None,
            "lastManual": last_manual.isoformat(timespec="seconds") if last_manual else None,
            "lastSlot": slot.isoformat(timespec="seconds"),
            # Se o horário passou sem backup (navegador fechado, agente desligado),
            # o próximo check do app faz o backup — inclusive no dia seguinte.
            "due": settings.enabled and (last_auto is None or last_auto < slot),
        }

    @router.get("")
    async def list_backups():
        items = await asyncio.to_thread(store.list_backups)
        return {"items": items, "directory": str(store.directory), "keepAuto": KEEP_AUTO_BACKUPS}

    @router.get("/status")
    async def backup_status():
        return await asyncio.to_thread(status)

    @router.put("/settings")
    async def update_settings(payload: ScheduleUpdate):
        try:
            settings.update(enabled=payload.enabled, time=payload.time)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        result = await asyncio.to_thread(status)
        await broadcast({"type": "backup:status", "payload": result})
        return result

    @router.post("")
    async def save_backup(request: Request, kind: str = Query(default="manual", pattern="^(auto|manual)$")):
        payload = await request.json()
        if not isinstance(payload, dict) or payload.get("format") != "dashboard-backup":
            raise HTTPException(status_code=400, detail="Formato de backup inválido")

        # Vários navegadores/abas podem disparar o automático ao mesmo tempo:
        # o agente decide, e só o primeiro grava.
        if kind == "auto" and not status()["due"]:
            return {"skipped": True, "directory": str(store.directory)}

        path = await asyncio.to_thread(store.save, payload, kind)
        result = await asyncio.to_thread(status)
        await broadcast({"type": "backup:status", "payload": result})
        return {"skipped": False, "path": str(path), "name": path.name, "kind": kind, "directory": str(store.directory)}

    @router.get("/files/{name}")
    async def read_backup(name: str):
        try:
            backup = await asyncio.to_thread(store.read, name)
        except ValueError:
            raise HTTPException(status_code=422, detail="Arquivo de backup corrompido")
        if backup is None:
            raise HTTPException(status_code=404, detail="Backup não encontrado")
        return backup

    @router.post("/open-directory")
    async def open_backup_directory():
        directory = str(store.directory)
        if sys.platform == "win32":
            os.startfile(directory)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", directory])
        else:
            subprocess.Popen(["xdg-open", directory])
        return {"directory": directory}

    return router
