import asyncio
import json
import logging
import os
import secrets
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from src.auth import LocalAuth
from src.clipboard.monitor import ClipboardMonitor
from src.indexing.file_watcher import EditIndexStore
from src.protocol import AgentMessage
from src.retention.purge import PurgeService
from src.screenshot.capture import ScreenshotCapture

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("LocalAgent")

AGENT_HOME = Path(os.environ.get("DASHBOARD_AGENT_HOME", Path.home() / ".dashboard-agent"))
AGENT_HOME.mkdir(parents=True, exist_ok=True)

auth = LocalAuth(AGENT_HOME)
TOKEN = auth.get_or_create_token()

storage_dir = AGENT_HOME / "bau"
storage_dir.mkdir(parents=True, exist_ok=True)

index_store = EditIndexStore(AGENT_HOME)
clipboard_monitor = ClipboardMonitor(storage_dir=storage_dir, broadcast_fn=lambda payload: None)
purge_service = PurgeService(storage_dir=storage_dir)
screenshot_capture = ScreenshotCapture(storage_dir=storage_dir)
backup_dir = Path.home() / "Documents" / "Dashboard Backups"
backup_dir.mkdir(parents=True, exist_ok=True)


def validate_http_token(request: Request) -> None:
    token = request.headers.get("x-dashboard-agent-token")
    if not auth.validate_token(token):
        raise HTTPException(status_code=401, detail="Token do agente inválido")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async def broadcast(message: dict):
        if getattr(app.state, "websocket_clients", None):
            for websocket in list(app.state.websocket_clients):
                try:
                    await websocket.send_text(json.dumps(message))
                except Exception as exc:
                    logger.warning("Falha ao enviar mensagem push: %s", exc)

    clipboard_monitor.broadcast_fn = broadcast
    await clipboard_monitor.start()
    await purge_service.start()
    logger.info("Agent iniciado com monitor de clipboard e expurgo ativo")
    yield
    await clipboard_monitor.stop()
    await purge_service.stop()
    logger.info("Agent encerrado")


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

app = FastAPI(title="Dashboard Local Agent", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.websocket_clients = set()


@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "Dashboard Local Agent",
        "version": "0.1.0",
        "agentHome": str(AGENT_HOME),
    }


@app.get("/auth/token")
async def get_auth_token(request: Request):
    origin = request.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Origem não autorizada")
    return {"token": TOKEN}


@app.post("/backups")
async def save_backup(request: Request):
    validate_http_token(request)
    payload = await request.json()
    if not isinstance(payload, dict) or payload.get("format") != "dashboard-backup":
        raise HTTPException(status_code=400, detail="Formato de backup inválido")

    from datetime import datetime
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_path = backup_dir / f"dashboard-backup-{timestamp}.json"
    temporary_path = backup_path.with_suffix(".tmp")
    temporary_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary_path.replace(backup_path)
    return {"path": str(backup_path), "directory": str(backup_dir)}


@app.post("/backups/open-directory")
async def open_backup_directory(request: Request):
    validate_http_token(request)
    if sys.platform == "win32":
        os.startfile(str(backup_dir))
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(backup_dir)])
    else:
        subprocess.Popen(["xdg-open", str(backup_dir)])
    return {"directory": str(backup_dir)}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    app.state.websocket_clients.add(websocket)
    logger.info("Cliente WebSocket conectado ao Agent")

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                msg_dict = json.loads(raw_data)
                msg = AgentMessage(**msg_dict)

                if msg.type == "handshake":
                    payload = msg.payload or {}
                    token = payload.get("token") if isinstance(payload, dict) else None
                    logger.info(f"Handshake recebido do cliente: {payload}")

                    if not auth.validate_token(token):
                        response = AgentMessage(
                            type="handshake:rejected",
                            payload={"status": "rejected", "reason": "invalid_token"}
                        )
                        await websocket.send_text(response.model_dump_json())
                        await websocket.close(code=4001)
                        break

                    response = AgentMessage(
                        type="handshake:ack",
                        payload={"status": "authenticated", "agentVersion": "0.1.0"}
                    )
                    await websocket.send_text(response.model_dump_json())

                elif msg.type == "ping":
                    response = AgentMessage(type="pong", payload={"timestamp": json.dumps(msg.payload)})
                    await websocket.send_text(response.model_dump_json())

                elif msg.type == "screenshot:request":
                    try:
                        path = screenshot_capture.take_screenshot()
                        await websocket.send_text(
                            AgentMessage(
                                type="screenshot:result",
                                payload={"path": str(path), "timestamp": int(os.path.getmtime(path))},
                            ).model_dump_json()
                        )
                    except Exception as exc:
                        logger.exception("Falha ao capturar tela")
                        await websocket.send_text(
                            AgentMessage(
                                type="screenshot:error",
                                payload={"error": str(exc)},
                            ).model_dump_json()
                        )

                elif msg.type == "clipboard:pause":
                    clipboard_monitor.pause()
                    await websocket.send_text(
                        AgentMessage(type="clipboard:status", payload={"paused": True}).model_dump_json()
                    )

                elif msg.type == "clipboard:resume":
                    clipboard_monitor.resume()
                    await websocket.send_text(
                        AgentMessage(type="clipboard:status", payload={"paused": False}).model_dump_json()
                    )

                elif msg.type == "clipboard:status":
                    await websocket.send_text(
                        AgentMessage(type="clipboard:status", payload={"paused": clipboard_monitor.is_paused()}).model_dump_json()
                    )

                elif msg.type == "watcher:configure":
                    payload = msg.payload or {}
                    folders = payload.get("folders", []) if isinstance(payload, dict) else []
                    index_store.save_watched_folders([str(folder) for folder in folders])
                    await websocket.send_text(
                        AgentMessage(
                            type="watcher:configured",
                            payload={"folders": index_store.load_watched_folders()},
                        ).model_dump_json()
                    )

            except Exception as parse_err:
                logger.error(f"Erro ao processar mensagem JSON: {parse_err}")

    except WebSocketDisconnect:
        logger.info("Cliente WebSocket desconectado")
    finally:
        app.state.websocket_clients.discard(websocket)


if __name__ == "__main__":
    # Recarregamento automático apenas em desenvolvimento: DASHBOARD_AGENT_DEV=1
    dev_mode = os.environ.get("DASHBOARD_AGENT_DEV") == "1"
    uvicorn.run("src.main:app", host="127.0.0.1", port=5137, reload=dev_mode, reload_dirs=["src"] if dev_mode else None)
