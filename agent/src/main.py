import asyncio
import json
import logging
import os
import secrets
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
    uvicorn.run("src.main:app", host="127.0.0.1", port=5137, reload=True, reload_dirs=["src"])
