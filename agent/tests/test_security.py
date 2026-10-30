import pytest
from starlette.websockets import WebSocketDisconnect

from conftest import ORIGIN


def handshake(ws, token):
    ws.send_json({"type": "handshake", "payload": {"client": "pytest", "token": token}})
    return ws.receive_json()


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/bau/items"),
        ("GET", "/backups"),
        ("GET", "/backups/status"),
        ("GET", "/files/top"),
        ("GET", "/system/autostart"),
        ("POST", "/files/scan"),
    ],
)
def test_rotas_de_dados_exigem_token(client, method, path):
    assert client.request(method, path).status_code == 401
    assert client.request(method, path, headers={"X-Dashboard-Agent-Token": "errado"}).status_code == 401


def test_token_so_para_origens_permitidas(client, token):
    assert client.get("/auth/token", headers={"Origin": ORIGIN}).json()["token"] == token
    assert client.get("/auth/token", headers={"Origin": "https://site-malicioso.example"}).status_code == 403


def test_ws_recusa_origem_externa(client):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws", headers={"Origin": "https://site-malicioso.example"}) as ws:
            ws.receive_json()
    assert exc.value.code == 4003


def test_ws_bloqueia_comandos_antes_do_handshake(client):
    with client.websocket_connect("/ws", headers={"Origin": ORIGIN}) as ws:
        ws.send_json({"type": "clipboard:pause"})
        reply = ws.receive_json()
        assert reply["type"] == "error" and reply["payload"]["reason"] == "unauthenticated"
        # ping continua liberado (usado para checar se o agente está vivo)
        ws.send_json({"type": "ping", "payload": 1})
        assert ws.receive_json()["type"] == "pong"


def test_ws_rejeita_token_invalido(client):
    with client.websocket_connect("/ws", headers={"Origin": ORIGIN}) as ws:
        assert handshake(ws, "errado")["type"] == "handshake:rejected"


def test_ws_pausa_e_retoma_monitor(client, token, agent):
    with client.websocket_connect("/ws", headers={"Origin": ORIGIN}) as ws:
        assert handshake(ws, token)["type"] == "handshake:ack"
        ws.send_json({"type": "clipboard:pause"})
        assert ws.receive_json() == {"type": "clipboard:status", "payload": {"paused": True}}
        assert agent.clipboard_monitor.is_paused()
        ws.send_json({"type": "clipboard:resume"})
        assert ws.receive_json()["payload"] == {"paused": False}
        ws.send_json({"type": "clipboard:status"})
        assert ws.receive_json()["payload"] == {"paused": False}


def test_ws_captura_de_tela_vira_item_do_bau(client, token, agent, monkeypatch, png_bytes):
    # Dublê da captura: grava uma imagem pequena em vez de capturar a tela real.
    monkeypatch.setattr(agent.screenshot_capture, "take_screenshot", lambda: agent.bau_store.save("image", png_bytes, source="screenshot"))
    with client.websocket_connect("/ws", headers={"Origin": ORIGIN}) as ws:
        handshake(ws, token)
        ws.send_json({"type": "screenshot:request"})
        result = ws.receive_json()
        broadcast = ws.receive_json()
    assert result["type"] == "screenshot:result" and result["payload"]["source"] == "screenshot"
    assert broadcast == {"type": "bau:item-added", "payload": result["payload"]}


def test_token_comparado_em_tempo_constante(agent, token):
    assert agent.auth.validate_token(token)
    assert not agent.auth.validate_token(None)
    assert not agent.auth.validate_token("")
    assert not agent.auth.validate_token(token[:-1] + ("0" if token[-1] != "0" else "1"))
