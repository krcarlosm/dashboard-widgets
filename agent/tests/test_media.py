"""Conversor e Downloader (Fase 7).

Os testes de vídeo/áudio usam o ffmpeg instalado para gerar mídias sintéticas
e são pulados quando ele não existe. O download de ponta a ponta usa um
servidor HTTP local (extrator "generic" do yt-dlp): nada sai da máquina.
"""

import functools
import http.server
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

from src.media import api as media_api
from src.media.converter import ConvertOptions, plan_conversion, safe_file_name, unique_path
from src.media.downloader import DownloadOptions, build_download_args, friendly_error, validate_url
from src.media.jobs import JobFailed, JobManager
from src.media.tools import find_ffmpeg, ytdlp_version

FFMPEG = find_ffmpeg()
needs_ffmpeg = pytest.mark.skipif(not FFMPEG, reason="ffmpeg não instalado")
needs_ytdlp = pytest.mark.skipif(not ytdlp_version(), reason="yt-dlp não instalado")


def wait_job(client, auth, job_id, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        items = client.get("/media/jobs", headers=auth).json()["items"]
        job = next((item for item in items if item["id"] == job_id), None)
        if job and job["status"] in ("done", "error", "canceled"):
            return job
        time.sleep(0.1)
    raise AssertionError(f"Tarefa {job_id} não terminou")


def sleeper(seconds=30):
    return [sys.executable, "-c", f"import time; time.sleep({seconds})"]


@pytest.fixture(scope="module")
def sample_video(tmp_path_factory):
    if not FFMPEG:
        pytest.skip("ffmpeg não instalado")
    path = tmp_path_factory.mktemp("midia") / "amostra.mp4"
    subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=2",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(path)],
        check=True, capture_output=True, timeout=60,
    )
    return path


# ── Acesso e configurações ───────────────────────────────────────────────────

def test_rotas_exigem_token(client):
    assert client.get("/media/tools").status_code == 401
    assert client.post("/media/download", json={"url": "https://example.com"}).status_code == 401
    assert client.post("/media/convert?fileName=a.png", content=b"x").status_code == 401


def test_ferramentas_informam_status_e_instrucoes(client, auth):
    data = client.get("/media/tools", headers=auth).json()
    assert set(data) >= {"ffmpeg", "jsRuntime", "ytdlp", "hints", "formats"}
    assert data["ffmpeg"]["available"] == bool(FFMPEG)
    assert data["hints"]["ffmpeg"]
    assert "mp3" in data["formats"]["video"]["targets"]  # vídeo → áudio


def test_pasta_padrao_e_alteracao(client, auth, agent, tmp_path):
    default = client.get("/media/settings", headers=auth).json()
    assert default["downloadDir"] == default["convertDir"] == str(Path(agent.AGENT_HOME).parent / "media")

    response = client.put("/media/settings", headers=auth, json={"downloadDir": "relativa/pasta"})
    assert response.status_code == 400

    target = tmp_path / "Videos" / "Baixados"
    data = client.put("/media/settings", headers=auth, json={"downloadDir": str(target)}).json()
    assert data["downloadDir"] == str(target) and target.is_dir()
    assert data["convertDir"] == default["convertDir"]

    data = client.put("/media/settings", headers=auth, json={"downloadDir": ""}).json()
    assert data["downloadDir"] == default["downloadDir"]


# ── Conversor ────────────────────────────────────────────────────────────────

def test_plano_valida_formatos():
    assert plan_conversion("foto.JPEG", ConvertOptions(targetFormat="png")).target == "png"
    assert plan_conversion("video.mov", ConvertOptions(targetFormat="mp3")).category == "video"
    assert plan_conversion("som.wav", ConvertOptions(mode="compress")).target == "wav"
    with pytest.raises(ValueError):
        plan_conversion("planilha.xlsx", ConvertOptions(targetFormat="pdf"))
    with pytest.raises(ValueError):
        plan_conversion("foto.png", ConvertOptions(targetFormat="mp3"))
    with pytest.raises(ValueError):
        plan_conversion("antigo.wmv", ConvertOptions(mode="compress"))


def test_nomes_seguros_e_sem_sobrescrever(tmp_path):
    assert safe_file_name("../../evil.png") == "evil.png"
    assert safe_file_name('C:\\temp\\a<b>.jpg') == "a_b_.jpg"
    (tmp_path / "x.mp3").write_text("1")
    assert unique_path(tmp_path, "x.mp3").name == "x (2).mp3"


def test_converte_imagem_enviada_por_upload(client, auth, agent, png_bytes):
    response = client.post("/media/convert?fileName=../../Foto Teste.png&targetFormat=jpg", headers=auth, content=png_bytes)
    assert response.status_code == 200, response.text
    job = wait_job(client, auth, response.json()["id"])
    assert job["status"] == "done", job["error"]
    output = Path(job["outputs"][0]["path"])
    assert output.parent == agent.media_settings.convert_dir
    assert output.name == "Foto Teste_convertido.jpg"
    assert output.read_bytes()[:3] == b"\xff\xd8\xff"
    assert job["summary"] == "JPG"
    # A pasta temporária da tarefa é apagada ao terminar.
    assert list((Path(agent.AGENT_HOME) / "media-tmp").iterdir()) == []


def test_compactar_mantem_o_formato(client, auth, png_bytes):
    response = client.post("/media/convert?fileName=print.png&mode=compress&level=high", headers=auth, content=png_bytes)
    job = wait_job(client, auth, response.json()["id"])
    assert job["status"] == "done" and job["outputs"][0]["name"] == "print_compactado.png"
    assert "compactação alta" in job["summary"]


def test_upload_recusado_antes_de_gravar(client, auth, monkeypatch):
    assert client.post("/media/convert?fileName=x.xyz&targetFormat=png", headers=auth, content=b"x").status_code == 400
    assert client.post("/media/convert?fileName=a.png&targetFormat=mp3", headers=auth, content=b"x").status_code == 400
    assert client.post("/media/convert?fileName=a.png&targetFormat=jpg", headers=auth, content=b"").status_code == 400
    assert client.post("/media/convert?fileName=a.png&targetFormat=jpg&level=máximo", headers=auth, content=b"x").status_code == 422

    monkeypatch.setattr(media_api, "find_ffmpeg", lambda: None)
    response = client.post("/media/convert?fileName=video.mp4&targetFormat=mp3", headers=auth, content=b"x")
    assert response.status_code == 400 and "ffmpeg" in response.json()["detail"]


def test_imagem_invalida_vira_erro_legivel(client, auth):
    response = client.post("/media/convert?fileName=falsa.png&targetFormat=jpg", headers=auth, content=b"nao sou imagem")
    job = wait_job(client, auth, response.json()["id"])
    assert job["status"] == "error" and "imagem válida" in job["error"]


@needs_ffmpeg
def test_converte_video_para_audio_e_reduz_resolucao(client, auth, sample_video):
    data = sample_video.read_bytes()
    audio = client.post("/media/convert?fileName=amostra.mp4&targetFormat=mp3", headers=auth, content=data).json()
    video = client.post("/media/convert?fileName=amostra.mp4&mode=both&targetFormat=webm&level=high&resolution=360p", headers=auth, content=data).json()

    audio = wait_job(client, auth, audio["id"], timeout=90)
    assert audio["status"] == "done", audio["error"]
    assert audio["outputs"][0]["name"] == "amostra_convertido.mp3" and audio["outputs"][0]["size"] > 0

    video = wait_job(client, auth, video["id"], timeout=120)
    assert video["status"] == "done", video["error"]
    assert video["outputs"][0]["name"].endswith(".webm")
    assert video["summary"] == "WEBM · compactação alta · 360p"


def test_converter_arquivo_gerado_so_aceita_saidas_de_tarefas(client, auth, png_bytes, tmp_path):
    outsider = tmp_path / "qualquer.png"
    outsider.write_bytes(png_bytes)
    response = client.post("/media/convert-file", headers=auth, json={"path": str(outsider), "options": {"targetFormat": "jpg"}})
    assert response.status_code == 403

    first = wait_job(client, auth, client.post("/media/convert?fileName=base.png&targetFormat=webp", headers=auth, content=png_bytes).json()["id"])
    response = client.post("/media/convert-file", headers=auth, json={"path": first["outputs"][0]["path"], "options": {"targetFormat": "png"}})
    assert response.status_code == 200
    second = wait_job(client, auth, response.json()["id"])
    assert second["status"] == "done" and second["outputs"][0]["name"] == "base_convertido_convertido.png"
    assert Path(first["outputs"][0]["path"]).exists()  # a origem não é apagada


# ── Fila ─────────────────────────────────────────────────────────────────────

def test_fila_executa_um_por_vez_e_cancela():
    events = []
    manager = JobManager(notify=events.append)
    cleaned = []

    def long_runner(handle):
        handle.run_process(sleeper(), lambda line: None)
        return []

    first = manager.submit("convert", "longa", long_runner)
    second = manager.submit("convert", "na fila", lambda handle: [], cleanup=lambda: cleaned.append("fila"))
    deadline = time.time() + 10
    while manager._handles[first["id"]].process is None and time.time() < deadline:
        time.sleep(0.05)
    assert manager.get(first["id"])["status"] == "running"
    assert manager.get(second["id"])["status"] == "queued"

    assert manager.cancel(second["id"])["status"] == "canceled"
    started = time.time()
    manager.cancel(first["id"])
    assert manager.wait(first["id"], 10)["status"] == "canceled"
    assert time.time() - started < 8
    manager.wait(second["id"], 5)
    deadline = time.time() + 5
    while not cleaned and time.time() < deadline:
        time.sleep(0.05)
    assert cleaned == ["fila"]  # a limpeza roda mesmo para quem nem começou
    assert {event["status"] for event in events} >= {"queued", "running", "canceled"}


def test_ultima_atualizacao_de_progresso_sempre_chega():
    events = []
    manager = JobManager(notify=events.append)

    def runner(handle):
        for value in (10.0, 20.0, 30.0):  # em rajada: só a 1ª sai na hora
            handle.update(progress=value, stage="Convertendo")
        time.sleep(0.6)
        return []

    job = manager.submit("convert", "x", runner)
    manager.wait(job["id"], 5)
    running = [event["progress"] for event in events if event["status"] == "running"]
    assert running[-1] == 30.0


def test_falhas_viram_status_de_erro():
    manager = JobManager()

    def failing(handle):
        raise JobFailed("mensagem para o usuário")

    job = manager.submit("download", "x", failing)
    assert manager.wait(job["id"], 5)["error"] == "mensagem para o usuário"
    assert manager.remove(job["id"]) and manager.get(job["id"]) is None


def test_cancelar_e_remover_pela_api(client, auth, agent):
    job = agent.media_jobs.submit("download", "demorado", lambda handle: handle.run_process(sleeper(), lambda line: None) or [])
    deadline = time.time() + 10
    while agent.media_jobs.get(job["id"])["status"] != "running" and time.time() < deadline:
        time.sleep(0.05)
    assert client.post(f"/media/jobs/{job['id']}/open", headers=auth).status_code == 409

    response = client.delete(f"/media/jobs/{job['id']}", headers=auth).json()
    assert response["removed"] is False
    assert agent.media_jobs.wait(job["id"], 10)["status"] == "canceled"
    assert client.delete(f"/media/jobs/{job['id']}", headers=auth).json()["removed"] is True
    assert client.delete("/media/jobs/inexistente", headers=auth).status_code == 404


def test_abrir_e_mostrar_arquivo_gerado(client, auth, png_bytes, monkeypatch):
    opened = []
    monkeypatch.setattr(media_api.opener, "open_file", lambda path: opened.append(("open", path)))
    monkeypatch.setattr(media_api.opener, "reveal_file", lambda path: opened.append(("reveal", path)))
    job = wait_job(client, auth, client.post("/media/convert?fileName=a.png&targetFormat=gif", headers=auth, content=png_bytes).json()["id"])
    path = job["outputs"][0]["path"]
    assert client.post(f"/media/jobs/{job['id']}/open", headers=auth).status_code == 200
    assert client.post(f"/media/jobs/{job['id']}/reveal", headers=auth).status_code == 200
    assert opened == [("open", path), ("reveal", path)]

    Path(path).unlink()
    assert client.post(f"/media/jobs/{job['id']}/open", headers=auth).status_code == 410


# ── Downloader ───────────────────────────────────────────────────────────────

def test_links_aceitos():
    assert validate_url(" https://youtu.be/abc ") == "https://youtu.be/abc"
    for bad in ("file:///etc/passwd", "javascript:alert(1)", "--exec calc", "ftp://x/y", "https://a b.com", ""):
        with pytest.raises(ValueError):
            validate_url(bad)


def test_argumentos_do_yt_dlp(tmp_path):
    url = "https://example.com/v"
    args = build_download_args(url, DownloadOptions(mode="audio", audioFormat="m4a", audioQuality="192"), tmp_path, tmp_path / "t")
    assert args[-2:] == ["--", url]  # o link nunca é lido como opção
    assert ["-x", "--audio-format", "m4a"] == args[args.index("-x"): args.index("-x") + 3]
    assert "192K" in args and "--no-playlist" in args and "--ignore-config" in args

    args = build_download_args(url, DownloadOptions(quality="720", videoFormat="mp4", subtitles=True, playlist=True, sectionStart="1:00"), tmp_path, tmp_path / "t")
    assert args[args.index("-S") + 1] == "res:720,ext:mp4:m4a"
    assert "--merge-output-format" in args and "--yes-playlist" in args
    assert "--embed-subs" in args and "--write-subs" in args
    assert args[args.index("--download-sections") + 1] == "*1:00-inf"
    assert args[args.index("-o") + 1].startswith("%(playlist_title")

    # Legendas não se aplicam a áudio.
    args = build_download_args(url, DownloadOptions(mode="audio", subtitles=True), tmp_path, tmp_path / "t")
    assert "--embed-subs" not in args


def test_opcoes_fora_da_lista_sao_recusadas(client, auth):
    for options in ({"rateLimit": "--exec calc"}, {"mode": "tudo"}, {"sectionStart": "1; rm"}, {"quality": "9999"}):
        response = client.post("/media/download", headers=auth, json={"url": "https://example.com/v", "options": options})
        assert response.status_code == 422, options
    assert client.post("/media/download", headers=auth, json={"url": "file:///c:/x"}).status_code == 400


def test_mensagens_de_erro_amigaveis():
    assert friendly_error(["WARNING: x", "ERROR: [generic] Unsupported URL: https://x"]) == "Este link não é suportado pelo yt-dlp."
    assert friendly_error(["ERROR: algo novo"]) == "algo novo"


def test_atualizacao_bloqueada_durante_download(client, auth, agent, monkeypatch):
    monkeypatch.setattr(media_api, "update_ytdlp", lambda: {"before": "1", "after": "2", "updated": True})
    assert client.post("/media/ytdlp/update", headers=auth).json()["updated"] is True

    job = agent.media_jobs.submit("download", "x", lambda handle: handle.run_process(sleeper(), lambda line: None) or [])
    assert client.post("/media/ytdlp/update", headers=auth).status_code == 409
    agent.media_jobs.cancel(job["id"])
    agent.media_jobs.wait(job["id"], 10)


@pytest.fixture
def local_site(sample_video, monkeypatch):
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost")
    monkeypatch.setenv("no_proxy", "127.0.0.1,localhost")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(sample_video.parent))
    handler.log_message = lambda *args: None
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@needs_ffmpeg
@needs_ytdlp
def test_baixa_de_ponta_a_ponta_em_servidor_local(client, auth, agent, local_site, tmp_path):
    url = f"{local_site}/amostra.mp4"
    info = client.post("/media/download/preview", headers=auth, json={"url": url})
    assert info.status_code == 200, info.text
    assert info.json()["kind"] == "video" and info.json()["title"] == "amostra"

    client.put("/media/settings", headers=auth, json={"downloadDir": str(tmp_path / "baixados")})
    job = client.post("/media/download", headers=auth, json={"url": url, "title": "amostra", "options": {"mode": "audio", "audioFormat": "mp3"}}).json()
    assert job["summary"] == "Áudio MP3"
    job = wait_job(client, auth, job["id"], timeout=120)
    assert job["status"] == "done", job["error"]
    assert job["outputs"][0]["name"] == "amostra.mp3"
    assert Path(job["outputs"][0]["path"]).parent == tmp_path / "baixados"


@needs_ytdlp
def test_preview_de_link_invalido(client, auth, local_site):
    response = client.post("/media/download/preview", headers=auth, json={"url": f"{local_site}/nao-existe.mp4"})
    assert response.status_code == 400 and response.json()["detail"]
