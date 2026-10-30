import asyncio
import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pydantic import BaseModel
from src.auth import LocalAuth
from src.backup.api import create_backup_router
from src.backup.settings import BackupSettings
from src.backup.store import BackupStore, resolve_backup_dir
from src.bau.api import create_bau_router
from src.bau.settings import BauSettings
from src.bau.store import BauStore
from src.clipboard.monitor import ClipboardMonitor
from src.files.api import create_files_router
from src.files.service import FileActivityService
from src.files.store import ActivityStore
from src.files.watcher import FolderSettings
from src.protocol import AgentMessage
from src.retention.purge import PurgeService
from src.screenshot.capture import ScreenshotCapture
from src.system import autostart

AGENT_HOME = Path(os.environ.get("DASHBOARD_AGENT_HOME", Path.home() / ".dashboard-agent"))
AGENT_HOME.mkdir(parents=True, exist_ok=True)

# Iniciado pelo pythonw.exe (início automático no Windows) não há console:
# sem isso o logging e o uvicorn falham ao escrever em stdout/stderr.
if sys.stdout is None or sys.stderr is None:
    _log_file = open(AGENT_HOME / "agent.log", "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stdout or _log_file
    sys.stderr = sys.stderr or _log_file

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("LocalAgent")

AGENT_PORT = int(os.environ.get("DASHBOARD_AGENT_PORT", "5137"))

auth = LocalAuth(AGENT_HOME)
TOKEN = auth.get_or_create_token()

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5137",
    "http://127.0.0.1:5137",
]
env_origins = os.environ.get("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in env_origins.split(",") if o.strip()] if env_origins else DEFAULT_ALLOWED_ORIGINS

# Somente clientes que concluíram o handshake com token recebem eventos.
authenticated_clients: set[WebSocket] = set()


async def broadcast(message: dict) -> None:
    text = json.dumps(message)
    for websocket in list(authenticated_clients):
        try:
            await websocket.send_text(text)
        except Exception as exc:
            logger.warning("Falha ao enviar mensagem push: %s", exc)


def require_token(request: Request) -> None:
    token = request.headers.get("x-dashboard-agent-token")
    if not auth.validate_token(token):
        raise HTTPException(status_code=401, detail="Token do agente inválido")


bau_store = BauStore(AGENT_HOME / "bau")
bau_settings = BauSettings(AGENT_HOME)
clipboard_monitor = ClipboardMonitor(store=bau_store, broadcast_fn=broadcast)
purge_service = PurgeService(
    store=bau_store,
    settings=bau_settings,
    on_removed=lambda ids: broadcast({"type": "bau:items-removed", "payload": {"ids": ids}}),
)
screenshot_capture = ScreenshotCapture(store=bau_store)
backup_store = BackupStore(resolve_backup_dir())
backup_settings = BackupSettings(AGENT_HOME)
activity_store = ActivityStore(AGENT_HOME)
file_activity = FileActivityService(
    store=activity_store,
    folder_settings=FolderSettings(AGENT_HOME),
    broadcast=broadcast,
    # Arquivos do próprio agente (Baú, backups) não são atividade do usuário.
    excluded_roots=[AGENT_HOME, backup_store.directory],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DASHBOARD_AGENT_CLIPBOARD=0 desliga o monitor (o Baú continua com capturas de tela).
    if os.environ.get("DASHBOARD_AGENT_CLIPBOARD", "1") != "0":
        await clipboard_monitor.start()
    else:
        logger.info("Monitor da área de transferência desativado (DASHBOARD_AGENT_CLIPBOARD=0)")
    await purge_service.start()
    await file_activity.start()
    logger.info("Agent iniciado com monitor de clipboard e expurgo ativo")
    yield
    await clipboard_monitor.stop()
    await purge_service.stop()
    await file_activity.stop()
    logger.info("Agent encerrado")


app = FastAPI(title="Dashboard Local Agent", version="0.4.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    create_bau_router(
        store=bau_store,
        settings=bau_settings,
        monitor=clipboard_monitor,
        purge_service=purge_service,
        broadcast=broadcast,
        require_token=require_token,
    )
)
app.include_router(create_files_router(store=activity_store, service=file_activity, require_token=require_token))
app.include_router(
    create_backup_router(
        store=backup_store,
        settings=backup_settings,
        broadcast=broadcast,
        require_token=require_token,
    )
)


@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "Dashboard Local Agent",
        "version": app.version,
        "agentHome": str(AGENT_HOME),
    }


@app.get("/auth/token")
async def get_auth_token(request: Request):
    origin = request.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Origem não autorizada")
    return {"token": TOKEN}


class AutostartPayload(BaseModel):
    enabled: bool


@app.get("/system/autostart")
async def get_autostart(request: Request):
    require_token(request)
    return autostart.status()


@app.put("/system/autostart")
async def put_autostart(payload: AutostartPayload, request: Request):
    require_token(request)
    try:
        return await asyncio.to_thread(autostart.set_enabled, payload.enabled)
    except Exception as exc:
        logger.exception("Falha ao alterar o início automático")
        raise HTTPException(status_code=500, detail=f"Não foi possível alterar o início automático: {exc}")


async def send(websocket: WebSocket, message_type: str, payload=None) -> None:
    await websocket.send_text(AgentMessage(type=message_type, payload=payload).model_dump_json())


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # WebSocket não passa por CORS: qualquer site aberto no navegador poderia conectar.
    origin = websocket.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        logger.warning("Conexão WebSocket recusada para a origem %s", origin)
        await websocket.close(code=4003)
        return

    await websocket.accept()
    is_authenticated = False
    logger.info("Cliente WebSocket conectado ao Agent")

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                msg = AgentMessage(**json.loads(raw_data))

                if msg.type == "handshake":
                    payload = msg.payload if isinstance(msg.payload, dict) else {}
                    logger.info("Handshake recebido do cliente %s", payload.get("client", "desconhecido"))

                    if not auth.validate_token(payload.get("token")):
                        await send(websocket, "handshake:rejected", {"status": "rejected", "reason": "invalid_token"})
                        await websocket.close(code=4001)
                        break

                    is_authenticated = True
                    authenticated_clients.add(websocket)
                    await send(websocket, "handshake:ack", {"status": "authenticated", "agentVersion": app.version})
                    continue

                if msg.type == "ping":
                    await send(websocket, "pong", {"timestamp": json.dumps(msg.payload)})
                    continue

                # Qualquer outro comando exige handshake concluído.
                if not is_authenticated:
                    await send(websocket, "error", {"reason": "unauthenticated", "type": msg.type})
                    continue

                if msg.type == "screenshot:request":
                    try:
                        item = await asyncio.to_thread(screenshot_capture.take_screenshot)
                        await send(websocket, "screenshot:result", item.to_dict())
                        await broadcast({"type": "bau:item-added", "payload": item.to_dict()})
                    except Exception as exc:
                        logger.exception("Falha ao capturar tela")
                        await send(websocket, "screenshot:error", {"error": str(exc)})

                elif msg.type == "clipboard:pause":
                    clipboard_monitor.pause()
                    await broadcast({"type": "clipboard:status", "payload": {"paused": True}})

                elif msg.type == "clipboard:resume":
                    clipboard_monitor.resume()
                    await broadcast({"type": "clipboard:status", "payload": {"paused": False}})

                elif msg.type == "clipboard:status":
                    await send(websocket, "clipboard:status", {"paused": clipboard_monitor.is_paused()})

            except Exception as parse_err:
                logger.error(f"Erro ao processar mensagem JSON: {parse_err}")

    except WebSocketDisconnect:
        logger.info("Cliente WebSocket desconectado")
    finally:
        authenticated_clients.discard(websocket)


if __name__ == "__main__":
    # Recarregamento automático apenas em desenvolvimento: DASHBOARD_AGENT_DEV=1
    dev_mode = os.environ.get("DASHBOARD_AGENT_DEV") == "1"
    uvicorn.run("src.main:app", host="127.0.0.1", port=AGENT_PORT, reload=dev_mode, reload_dirs=["src"] if dev_mode else None)
