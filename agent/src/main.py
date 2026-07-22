import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from src.protocol import AgentMessage

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("LocalAgent")

app = FastAPI(title="Dashboard Local Agent", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok", "service": "Dashboard Local Agent", "version": "0.1.0"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Cliente WebSocket conectado ao Agent")
    
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                msg_dict = json.loads(raw_data)
                msg = AgentMessage(**msg_dict)
                
                if msg.type == "handshake":
                    logger.info(f"Handshake recebido do cliente: {msg.payload}")
                    response = AgentMessage(
                        type="handshake:ack",
                        payload={"status": "authenticated", "agentVersion": "0.1.0"}
                    )
                    await websocket.send_text(response.model_dump_json())
                
                elif msg.type == "ping":
                    response = AgentMessage(type="pong", payload={"timestamp": json.dumps(msg.payload)})
                    await websocket.send_text(response.model_dump_json())

            except Exception as parse_err:
                logger.error(f"Erro ao processar mensagem JSON: {parse_err}")
                
    except WebSocketDisconnect:
        logger.info("Cliente WebSocket desconectado")


if __name__ == "__main__":
    uvicorn.run("src.main:app", host="127.0.0.1", port=8765, reload=True)
