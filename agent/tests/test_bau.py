import asyncio
import os
import time

import pytest

from conftest import make_png
from src.bau.store import MAX_TEXT_BYTES, BauStore
from src.clipboard.monitor import ClipboardMonitor
from src.clipboard.platform_reader import ClipboardContent


# ── Armazenamento ────────────────────────────────────────────────────────────

def test_texto_preserva_quebras_de_linha_e_acentos(tmp_path):
    store = BauStore(tmp_path)
    item = store.save("text", "Olá Baú\r\nlinha 2".encode("utf-8"))
    assert store.read_text(item.id) == "Olá Baú\r\nlinha 2"
    assert item.preview.startswith("Olá") and item.chars == 16


def test_ids_em_milissegundos_e_colisao_no_mesmo_instante(tmp_path):
    store = BauStore(tmp_path)
    first = store.save("text", b"a")
    second = store.save("text", b"b")
    assert first.id != second.id
    assert abs(first.timestamp - time.time() * 1000) < 5000


def test_nomes_antigos_em_segundos_continuam_validos(tmp_path):
    store = BauStore(tmp_path)
    legacy = tmp_path / "textos" / f"clipboard_{int(time.time()) - 60}.txt"
    legacy.write_text("antigo", encoding="utf-8")
    items = store.list_items()
    assert len(items) == 1 and abs(items[0]["timestamp"] - (time.time() - 60) * 1000) < 5000


def test_rejeita_texto_grande_demais(tmp_path):
    assert BauStore(tmp_path).save("text", b"x" * (MAX_TEXT_BYTES + 1)) is None


def test_imagem_gera_miniatura_jpeg(tmp_path):
    store = BauStore(tmp_path)
    item = store.save("image", make_png(size=(1200, 900)))
    thumb = store.thumbnail_path(item.id)
    from PIL import Image

    with Image.open(thumb) as img:
        assert img.format == "JPEG" and img.size[0] <= 320 and img.size[1] <= 240


def test_hash_de_imagem_ignora_metadados_do_png(tmp_path):
    from src.bau.store import content_hash

    assert content_hash("image", make_png()) == content_hash("image", make_png())
    assert content_hash("image", make_png()) != content_hash("image", make_png(color=(0, 0, 0)))


def test_expurgo_remove_so_itens_antigos(tmp_path):
    store = BauStore(tmp_path)
    recent = store.save("text", b"recente")
    old = tmp_path / "textos" / f"clipboard_{int((time.time() - 30 * 3600) * 1000)}.txt"
    old.write_text("velho", encoding="utf-8")
    removed = store.purge_older_than(24)
    assert removed == [old.name]
    assert store.get(recent.id) is not None


def test_busca_e_limite(tmp_path):
    store = BauStore(tmp_path)
    for text in ("relatório mensal", "senha do wifi", "Relatório anual"):
        store.save("text", text.encode("utf-8"))
    assert {item["preview"] for item in store.list_items(query="RELATÓRIO")} == {"relatório mensal", "Relatório anual"}
    assert len(store.list_items(limit=1)) == 1


@pytest.mark.parametrize("item_id", ["../auth.token", "clipboard_1.txt/../../x", "outro_123.txt", "clipboard_abc.txt"])
def test_ids_invalidos_nao_acessam_arquivos(tmp_path, item_id):
    store = BauStore(tmp_path)
    assert store.read_text(item_id) is None and store.image_path(item_id) is None and not store.delete(item_id)


# ── Monitor (com leitor/escritor falsos) ─────────────────────────────────────

def test_monitor_deduplica_e_ignora_a_propria_copia(tmp_path, monkeypatch):
    store = BauStore(tmp_path)
    events = []

    async def broadcast(message):
        events.append(message)

    monitor = ClipboardMonitor(store, broadcast)
    content = ClipboardContent(kind="text", data=b"mesmo texto", text="mesmo texto")
    asyncio.run(monitor._handle(content))
    asyncio.run(monitor._handle(content))
    assert len(store.list_items()) == 1 and len(events) == 1

    written = []

    class FakeWriter:
        def write_text(self, text):
            written.append(text)

        def write_image(self, data):
            written.append(data)

    monkeypatch.setattr("src.clipboard.monitor.get_writer", lambda: FakeWriter())
    other = store.save("text", b"outro")
    assert monitor.copy_item_to_clipboard(other.id) and written == ["outro"]
    # O agente acabou de escrever: a leitura seguinte não vira item novo.
    asyncio.run(monitor._handle(ClipboardContent(kind="text", data=b"outro", text="outro")))
    assert len(store.list_items()) == 2


def test_leitor_linux_respeita_dica_de_gerenciador_de_senhas(monkeypatch):
    from src.clipboard import platform_reader

    reader = platform_reader.LinuxClipboardReader()
    monkeypatch.setattr(platform_reader, "_use_wayland", lambda: True)
    calls = {"types": [platform_reader.LINUX_PRIVATE_TYPE, "text/plain"]}
    monkeypatch.setattr(reader, "_list_types", lambda: calls["types"])
    monkeypatch.setattr(reader, "_fetch", lambda mime: b"segredo")
    assert reader.read() is None
    calls["types"] = ["text/plain;charset=utf-8"]
    assert reader.read().text == "segredo"


# ── API ──────────────────────────────────────────────────────────────────────

def test_api_lista_busca_conteudo_e_contagens(client, auth, agent, png_bytes):
    text = agent.bau_store.save("text", "Olá\r\nmundo".encode("utf-8"))
    image = agent.bau_store.save("image", png_bytes)
    data = client.get("/bau/items", headers=auth).json()
    assert data["counts"] == {"text": 1, "image": 1} and data["retentionHours"] == 72
    assert data["retentionOptions"] == [24, 48, 72]
    assert [i["id"] for i in client.get("/bau/items?kind=text&q=mundo", headers=auth).json()["items"]] == [text.id]
    assert client.get(f"/bau/items/{text.id}/content", headers=auth).json() == {"text": "Olá\r\nmundo"}
    response = client.get(f"/bau/items/{image.id}/content", headers=auth)
    assert response.headers["content-type"] == "image/png"
    assert client.get(f"/bau/items/{image.id}/thumbnail", headers=auth).headers["content-type"] == "image/jpeg"
    assert client.get("/bau/items/..%2F..%2Fauth.token/content", headers=auth).status_code == 404


def test_api_retencao_valida_e_expurga(client, auth, agent):
    old = agent.bau_store.text_dir / f"clipboard_{int((time.time() - 30 * 3600) * 1000)}.txt"
    old.write_text("velho", encoding="utf-8")
    assert client.put("/bau/settings", json={"retentionHours": 12}, headers=auth).status_code in (400, 422)
    assert client.put("/bau/settings", json={"retentionHours": 24}, headers=auth).json()["retentionHours"] == 24
    assert not old.exists()


def test_api_copiar_excluir_e_limpar(client, auth, agent, monkeypatch):
    copied = []
    monkeypatch.setattr(agent.clipboard_monitor, "copy_item_to_clipboard", lambda item_id: copied.append(item_id) or True)
    a = agent.bau_store.save("text", b"a")
    agent.bau_store.save("text", b"b")
    assert client.post(f"/bau/items/{a.id}/copy", headers=auth).status_code == 200 and copied == [a.id]
    assert client.delete(f"/bau/items/{a.id}", headers=auth).status_code == 200
    assert client.delete(f"/bau/items/{a.id}", headers=auth).status_code == 404
    assert client.delete("/bau/items?kind=text", headers=auth).status_code == 200
    assert agent.bau_store.counts()["text"] == 0
