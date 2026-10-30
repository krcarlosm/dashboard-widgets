"""Configuração comum da suíte do agente.

As variáveis de ambiente são definidas ANTES de importar `src.main`, porque o
módulo cria a pasta do agente, o token e as pastas de backup na importação.
Nada aqui lê ou escreve a área de transferência real, captura a tela ou mexe
na pasta Inicializar do usuário: tudo vai para uma pasta temporária.
"""

import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

AGENT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AGENT_DIR))

_SANDBOX = Path(tempfile.mkdtemp(prefix="dashboard-agent-tests-"))
os.environ["DASHBOARD_AGENT_HOME"] = str(_SANDBOX / "home")
os.environ["DASHBOARD_BACKUP_DIR"] = str(_SANDBOX / "backups")
os.environ["DASHBOARD_AUTOSTART_DIR"] = str(_SANDBOX / "startup")

from fastapi.testclient import TestClient  # noqa: E402

from src import main  # noqa: E402

ORIGIN = "http://localhost:5173"


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_SANDBOX, ignore_errors=True)


@pytest.fixture(scope="session")
def agent():
    return main


@pytest.fixture
def client(agent):
    # Sem `with`: o lifespan (monitor da área de transferência, expurgo e
    # varredura de arquivos) não é iniciado durante os testes.
    return TestClient(agent.app)


@pytest.fixture(scope="session")
def token(agent):
    return agent.TOKEN


@pytest.fixture
def auth(token):
    return {"X-Dashboard-Agent-Token": token, "Origin": ORIGIN}


def make_png(color=(30, 120, 200), size=(64, 48)) -> bytes:
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def png_bytes():
    return make_png()


@pytest.fixture(autouse=True)
def clean_state(agent):
    """Cada teste começa com Baú, backups e histórico de arquivos vazios."""
    agent.bau_store.clear()
    for path in agent.backup_store.directory.glob("*"):
        path.unlink()
    agent.backup_settings.path.unlink(missing_ok=True)
    agent.bau_settings.path.unlink(missing_ok=True)
    with agent.activity_store._connect() as conn:
        conn.executescript("DELETE FROM access_events; DELETE FROM known_files; DELETE FROM recent_seen;")
    yield
