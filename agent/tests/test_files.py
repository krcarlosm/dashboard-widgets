import os
import sys
import time
from pathlib import Path

import pytest

from src.files.filters import is_excluded_name, is_executable, is_under
from src.files.recent import WindowsRecentReader, XbelRecentReader
from src.files.service import FileActivityService
from src.files.store import ActivityStore
from src.files.watcher import FolderSettings


async def _noop(_message):
    return None


@pytest.fixture
def store(tmp_path):
    return ActivityStore(tmp_path / "home")


@pytest.fixture
def files(tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    paths = {}
    for name in ("Relatorio.xlsx", "notas.md", "antigo.pdf"):
        (work / name).write_text("x")
        paths[name] = str(work / name)
    return paths


# ── Armazenamento ────────────────────────────────────────────────────────────

def test_agrupa_salvamentos_automaticos_e_aberturas(store, files):
    now = time.time()
    path = files["Relatorio.xlsx"]
    assert store.record(path, "edited", now - 600)
    assert not store.record(path, "edited", now - 400)  # mesmo salvamento (5 min)
    assert store.record(path, "edited", now - 10)
    assert store.record(path, "opened", now - 100)
    assert not store.record(path, "opened", now - 70)  # aberturas em 60 s
    item = store.top()[0]
    assert (item["opened"], item["edited"], item["total"]) == (1, 2, 3)
    assert item["lastAccess"] > 10**12  # milissegundos


@pytest.mark.skipif(sys.platform != "win32", reason="só o Windows ignora maiúsculas nos caminhos")
def test_caminho_com_outra_caixa_e_o_mesmo_arquivo(store, files):
    store.record(files["notas.md"], "opened")
    store.record(files["notas.md"].upper(), "edited")
    assert len(store.top()) == 1


def test_ranking_janela_filtro_e_expurgo(store, files):
    now = time.time()
    for offset in (300, 200, 100):
        store.record(files["notas.md"], "opened", now - offset * 61)
    store.record(files["Relatorio.xlsx"], "edited", now - 50)
    store.record(files["antigo.pdf"], "opened", now - 8 * 86400)

    assert [item["name"] for item in store.top()] == ["notas.md", "Relatorio.xlsx"]
    assert [item["name"] for item in store.top(kind="edited")] == ["Relatorio.xlsx"]
    assert store.is_indexed(files["antigo.pdf"])
    assert store.purge(days=7) == 1 and not store.is_indexed(files["antigo.pdf"])


# ── Filtros ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "path",
    [
        r"C:\docs\~$Relatorio.xlsx",
        "/home/u/docs/.~lock.plano.odt#",
        r"C:\docs\download.tmp",
        r"C:\proj\node_modules\lib\index.js",
        "/home/u/.cache/thumb.png",
        r"C:\proj\pacote.egg-info\entry_points.txt",
        r"C:\venv\Lib\site-packages\mod.py",
        r"C:\docs\atalho.lnk",
    ],
)
def test_exclui_temporarios_e_pastas_de_ferramentas(path):
    assert is_excluded_name(path)


@pytest.mark.parametrize("path", [r"C:\Users\u\Documents\Plano.docx", "/home/u/Documentos/planilha.ods", r"C:\proj\requirements.txt"])
def test_aceita_documentos_comuns(path):
    assert not is_excluded_name(path)


def test_pasta_do_agente_e_executaveis(tmp_path):
    assert is_under(str(tmp_path / "bau" / "x.png"), [tmp_path])
    assert not is_under(str(tmp_path.parent / "outro.txt"), [tmp_path])
    assert is_executable("setup.EXE") and is_executable("script.ps1") and not is_executable("manual.pdf")


# ── Leitores de recentes ─────────────────────────────────────────────────────

def _iso(ts):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def test_xbel_do_linux(tmp_path, store):
    now = time.time()
    xbel = tmp_path / "recently-used.xbel"
    xbel.write_text(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<xbel version="1.0" xmlns:bookmark="http://www.freedesktop.org/standards/desktop-bookmarks">
<bookmark href="file:///home/u/Documentos/Plano%20Anual.odt" added="{_iso(now-3600)}" modified="{_iso(now-3600)}" visited="{_iso(now-3600)}">
 <info><metadata owner="http://freedesktop.org"><bookmark:applications>
  <bookmark:application name="LibreOffice" exec="soffice %u" modified="{_iso(now-60)}" count="3"/>
 </bookmark:applications></metadata></info></bookmark>
<bookmark href="file:///home/u/velho.txt" added="{_iso(now-20*86400)}" modified="{_iso(now-20*86400)}" visited="{_iso(now-20*86400)}"/>
<bookmark href="https://example.com" added="{_iso(now)}" modified="{_iso(now)}" visited="{_iso(now)}"/>
</xbel>""",
        encoding="utf-8",
    )
    reader = XbelRecentReader(xbel)
    opened = reader.read_new(store)
    assert len(opened) == 1
    assert opened[0][0] == "/home/u/Documentos/Plano Anual.odt" and abs(opened[0][1] - (now - 60)) < 2
    assert reader.read_new(store) == []


def test_xbel_corrompido_nao_derruba_o_agente(tmp_path, store):
    broken = tmp_path / "recently-used.xbel"
    broken.write_text("<xbel><bookmark", encoding="utf-8")
    assert XbelRecentReader(broken).read_new(store) == []


@pytest.mark.skipif(sys.platform != "win32", reason="pasta Recent e atalhos .lnk só no Windows")
def test_pasta_recent_do_windows_abertura_edicao_e_reabertura(tmp_path, store):
    from win32com.client import Dispatch

    work = tmp_path / "docs"
    recent = tmp_path / "Recent"
    work.mkdir()
    recent.mkdir()
    target = work / "Contrato.docx"
    target.write_text("v1")

    def shortcut(name, to):
        link = Dispatch("WScript.Shell").CreateShortcut(str(recent / name))
        link.TargetPath = str(to)
        link.Save()
        return recent / name

    link = shortcut("Contrato.docx.lnk", target)
    shortcut("Pasta.lnk", work)  # atalhos de pasta são ignorados

    service = FileActivityService(store, FolderSettings(tmp_path), _noop, reader=WindowsRecentReader(recent))
    service.scan_once()
    assert [item["name"] for item in store.top()] == ["Contrato.docx"]
    assert service.scan_once() == 0

    future = time.time() + 5
    os.utime(target, (future, future))
    assert service.scan_once() == 1 and store.top()[0]["edited"] == 1

    later = time.time() + 120
    os.utime(link, (later, later))  # o Explorer atualiza o atalho a cada abertura
    assert service.scan_once() == 1 and store.top()[0]["opened"] == 2


def test_pdf_baixado_e_so_aberto_nao_conta_como_editado(tmp_path, store):
    pdf = tmp_path / "manual.pdf"
    pdf.write_text("x")
    old = time.time() - 3600
    os.utime(pdf, (old, old))

    class Reader:
        def read_new(self, _store):
            return [(str(pdf), time.time() - 60)]

    service = FileActivityService(store, FolderSettings(tmp_path), _noop, reader=Reader())
    service.scan_once()
    item = store.top()[0]
    assert item["opened"] == 1 and item["edited"] == 0


# ── Pastas monitoradas ───────────────────────────────────────────────────────

def test_pastas_monitoradas_registram_edicoes(tmp_path, store):
    watched = tmp_path / "watched"
    watched.mkdir()
    settings = FolderSettings(tmp_path)
    with pytest.raises(ValueError):
        settings.save([str(tmp_path / "nao-existe")])

    service = FileActivityService(store, settings, _noop, reader=None)
    assert service.set_folders([str(watched), str(watched)]) == [str(watched)]
    try:
        (watched / "planilha.xlsx").write_text("1")
        (watched / "~$planilha.xlsx").write_text("lock")
        deadline = time.time() + 10
        while time.time() < deadline and not store.is_indexed(str(watched / "planilha.xlsx")):
            time.sleep(0.2)
        assert store.is_indexed(str(watched / "planilha.xlsx"))
        time.sleep(0.5)
        assert not store.is_indexed(str(watched / "~$planilha.xlsx"))
    finally:
        service.watcher.stop()


# ── API ──────────────────────────────────────────────────────────────────────

def test_api_top_e_abertura_restrita_ao_historico(client, auth, agent, tmp_path, monkeypatch):
    doc = tmp_path / "proposta.docx"
    doc.write_text("x")
    script = tmp_path / "rodar.ps1"
    script.write_text("x")
    agent.activity_store.record(str(doc), "opened")
    agent.activity_store.record(str(script), "opened")

    calls = []
    monkeypatch.setattr("src.files.opener.open_file", lambda path: calls.append(("open", path)))
    monkeypatch.setattr("src.files.opener.reveal_file", lambda path: calls.append(("reveal", path)))

    data = client.get("/files/top", headers=auth).json()
    assert data["windowDays"] == 7 and {item["name"] for item in data["items"]} == {"proposta.docx", "rodar.ps1"}

    assert client.post("/files/open", json={"path": str(doc)}, headers=auth).json() == {"opened": True, "revealed": False}
    # Script não é executado: só mostrado na pasta.
    assert client.post("/files/open", json={"path": str(script)}, headers=auth).json() == {"opened": False, "revealed": True}
    assert client.post("/files/open", json={"path": str(tmp_path / "fora.txt")}, headers=auth).status_code == 403
    assert calls == [("open", str(doc)), ("reveal", str(script))]

    doc.unlink()
    assert client.post("/files/open", json={"path": str(doc)}, headers=auth).status_code == 404
    assert [item["name"] for item in client.get("/files/top", headers=auth).json()["items"]] == ["rodar.ps1"]
    assert client.get("/files/top?kind=x", headers=auth).status_code == 422


def test_api_pastas_monitoradas(client, auth, agent, tmp_path):
    try:
        assert client.put("/files/folders", json={"folders": [str(tmp_path / "x")]}, headers=auth).status_code == 400
        assert client.put("/files/folders", json={"folders": [str(tmp_path)]}, headers=auth).json()["folders"] == [str(tmp_path)]
        assert client.get("/files/folders", headers=auth).json()["folders"] == [str(tmp_path)]
    finally:
        client.put("/files/folders", json={"folders": []}, headers=auth)
