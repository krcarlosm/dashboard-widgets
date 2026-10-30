import sys
from datetime import datetime, timedelta

import pytest

from src.backup.settings import BackupSettings
from src.backup.store import KEEP_AUTO_BACKUPS, BackupStore, last_slot
from src.system import autostart

PAYLOAD = {"format": "dashboard-backup", "version": 1, "scope": "canvas", "profile": {"widgets": []}}


# ── Armazenamento e agenda ───────────────────────────────────────────────────

def test_rodizio_mantem_dez_automaticos_e_preserva_manuais(tmp_path):
    store = BackupStore(tmp_path)
    base = datetime(2026, 10, 1, 16, 30)
    for day in range(12):
        store.save(PAYLOAD, "auto", now=base + timedelta(days=day))
    store.save(PAYLOAD, "manual", now=base)
    (tmp_path / "dashboard-backup-2025-01-01_10-00-00.json").write_text("{}")
    (tmp_path / "outro-arquivo.json").write_text("{}")

    items = store.list_backups()
    autos = [item for item in items if item["kind"] == "auto"]
    assert len(autos) == KEEP_AUTO_BACKUPS
    assert autos[-1]["createdAt"].startswith("2026-10-03")
    assert sum(item["kind"] == "manual" for item in items) == 2  # manual + legado sem prefixo
    assert all(item["name"] != "outro-arquivo.json" for item in items)


def test_nomes_no_mesmo_segundo_nao_se_sobrescrevem(tmp_path):
    store = BackupStore(tmp_path)
    now = datetime(2026, 10, 1, 10, 0)
    names = {store.save(PAYLOAD, "manual", now=now).name for _ in range(3)}
    assert len(names) == 3


@pytest.mark.parametrize("name", ["../auth.token", "outro-arquivo.json", "auto-dashboard-backup-x.json"])
def test_leitura_recusa_nomes_fora_do_padrao(tmp_path, name):
    assert BackupStore(tmp_path).read(name) is None


@pytest.mark.parametrize(
    "now,expected",
    [
        (datetime(2026, 10, 30, 16, 29), datetime(2026, 10, 29, 16, 30)),
        (datetime(2026, 10, 30, 16, 30), datetime(2026, 10, 30, 16, 30)),
        (datetime(2026, 11, 1, 0, 5), datetime(2026, 10, 31, 16, 30)),
    ],
)
def test_ultimo_horario_agendado(now, expected):
    assert last_slot(now, 16, 30) == expected


def test_agenda_padrao_e_validacao(tmp_path):
    settings = BackupSettings(tmp_path)
    assert settings.to_dict() == {"enabled": True, "time": "16:30"}
    settings.update(enabled=False, time="08:05")
    assert settings.to_dict() == {"enabled": False, "time": "08:05"}
    with pytest.raises(ValueError):
        settings.update(time="25:00")


# ── API ──────────────────────────────────────────────────────────────────────

def test_backup_automatico_unico_por_horario(client, auth):
    status = client.get("/backups/status", headers=auth).json()
    assert status["due"] and status["lastAuto"] is None and status["time"] == "16:30"

    first = client.post("/backups?kind=auto", json=PAYLOAD, headers=auth).json()
    assert first["skipped"] is False and first["name"].startswith("auto-")
    # Outra aba aberta tenta o mesmo backup: o agente ignora.
    assert client.post("/backups?kind=auto", json=PAYLOAD, headers=auth).json()["skipped"] is True
    assert client.get("/backups/status", headers=auth).json()["due"] is False


def test_backup_manual_listagem_e_leitura(client, auth):
    saved = client.post("/backups", json=PAYLOAD, headers=auth).json()
    assert saved["name"].startswith("manual-")
    names = [item["name"] for item in client.get("/backups", headers=auth).json()["items"]]
    assert names == [saved["name"]]
    assert client.get(f"/backups/files/{saved['name']}", headers=auth).json() == PAYLOAD
    assert client.get("/backups/files/..%2Fhome%2Fauth.token", headers=auth).status_code == 404


def test_backup_valida_formato_e_tipo(client, auth):
    assert client.post("/backups", json={"format": "outro"}, headers=auth).status_code == 400
    assert client.post("/backups?kind=xpto", json=PAYLOAD, headers=auth).status_code == 422


def test_agenda_desativada_nunca_fica_devida(client, auth):
    status = client.put("/backups/settings", json={"enabled": False, "time": "07:15"}, headers=auth).json()
    assert status["enabled"] is False and status["time"] == "07:15" and status["due"] is False
    assert client.post("/backups?kind=auto", json=PAYLOAD, headers=auth).json()["skipped"] is True
    assert client.put("/backups/settings", json={"time": "7h"}, headers=auth).status_code == 400


# ── Início automático ────────────────────────────────────────────────────────

def test_autostart_liga_e_desliga(client, auth, tmp_path, monkeypatch):
    monkeypatch.setenv("DASHBOARD_AUTOSTART_DIR", str(tmp_path))
    assert client.get("/system/autostart", headers=auth).json()["enabled"] is False
    enabled = client.put("/system/autostart", json={"enabled": True}, headers=auth).json()
    entry = tmp_path / ("Dashboard Agent.lnk" if sys.platform == "win32" else "dashboard-agent.desktop")
    assert enabled["enabled"] and entry.exists()
    assert client.put("/system/autostart", json={"enabled": False}, headers=auth).json()["enabled"] is False
    assert not entry.exists()


@pytest.mark.skipif(sys.platform != "win32", reason="atalho .lnk só existe no Windows")
def test_atalho_windows_usa_pythonw_sem_console(tmp_path, monkeypatch):
    monkeypatch.setenv("DASHBOARD_AUTOSTART_DIR", str(tmp_path))
    autostart.set_enabled(True)
    from win32com.client import Dispatch

    shortcut = Dispatch("WScript.Shell").CreateShortcut(str(tmp_path / "Dashboard Agent.lnk"))
    assert shortcut.TargetPath.lower().endswith("pythonw.exe")
    assert shortcut.Arguments == "-m src.main"
    assert shortcut.WorkingDirectory.lower() == str(autostart.AGENT_DIR).lower()


def test_arquivo_desktop_do_linux(tmp_path):
    entry = tmp_path / "dashboard-agent.desktop"
    autostart._write_linux_desktop_file(entry)
    content = entry.read_text(encoding="utf-8")
    assert "[Desktop Entry]" in content and "-m src.main" in content
    assert f"Path={autostart.AGENT_DIR}" in content and "Terminal=false" in content
