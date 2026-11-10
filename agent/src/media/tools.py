"""Ferramentas externas usadas pelo Conversor e pelo Downloader.

- ffmpeg/ffprobe: conversão de vídeo/áudio e, no yt-dlp, juntar vídeo + áudio
  e extrair áudio. Procurado no PATH, em DASHBOARD_FFMPEG e, no Windows, nas
  pastas do winget (o agente iniciado pelo atalho de inicialização pode não
  herdar o PATH atualizado depois de uma instalação).
- Runtime JavaScript (deno, node ou bun): o YouTube exige um para liberar
  todos os formatos no yt-dlp.
- yt-dlp: dependência Python do agente, executado como subprocesso
  (`python -m yt_dlp`) — cancelar é encerrar o processo, e uma atualização
  vale já para o próximo download, sem reiniciar o agente.
"""

import os
import shutil
import signal
import subprocess
import sys
from importlib import metadata, util
from pathlib import Path
from typing import Optional

IS_WINDOWS = sys.platform == "win32"


def _winget_candidates(name: str) -> list[Path]:
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    if not local.parts:
        return []
    candidates = [local / "Microsoft" / "WinGet" / "Links" / f"{name}.exe"]
    packages = local / "Microsoft" / "WinGet" / "Packages"
    try:
        candidates += sorted(packages.glob(f"*/*/bin/{name}.exe"), reverse=True)
        candidates += sorted(packages.glob(f"*/{name}.exe"), reverse=True)
    except OSError:
        pass
    return candidates


def find_executable(name: str) -> Optional[str]:
    found = shutil.which(name)
    if found:
        return found
    if IS_WINDOWS:
        for candidate in _winget_candidates(name):
            if candidate.is_file():
                return str(candidate)
    return None


def find_ffmpeg() -> Optional[str]:
    override = os.environ.get("DASHBOARD_FFMPEG")
    if override:
        return override if Path(override).is_file() else None
    return find_executable("ffmpeg")


def find_ffprobe(ffmpeg: Optional[str] = None) -> Optional[str]:
    ffmpeg = ffmpeg or find_ffmpeg()
    if ffmpeg:
        sibling = Path(ffmpeg).with_name("ffprobe.exe" if IS_WINDOWS else "ffprobe")
        if sibling.is_file():
            return str(sibling)
    return find_executable("ffprobe")


def find_js_runtime() -> Optional[tuple[str, str]]:
    """Primeiro runtime disponível, na ordem recomendada pelo yt-dlp."""
    for name in ("deno", "node", "bun"):
        path = find_executable(name)
        if path:
            return name, path
    return None


def python_executable() -> str:
    """Python do agente para rodar `-m yt_dlp`/`-m pip` (python.exe em vez de pythonw.exe)."""
    current = Path(sys.executable)
    if current.name.lower() == "pythonw.exe":
        console = current.with_name("python.exe")
        if console.is_file():
            return str(console)
    return sys.executable


def ytdlp_version() -> Optional[str]:
    if util.find_spec("yt_dlp") is None:
        return None
    try:
        return metadata.version("yt-dlp")
    except metadata.PackageNotFoundError:
        return "desconhecida"


def _first_line_version(executable: str) -> Optional[str]:
    try:
        result = subprocess.run(
            [executable, "-version"], capture_output=True, text=True, timeout=10, **hidden_window_kwargs()
        )
        first = (result.stdout or "").splitlines()[0] if result.stdout else ""
        # "ffmpeg version 7.1-full_build-www.gyan.dev Copyright …" → "7.1-full_build-www.gyan.dev"
        parts = first.split()
        return parts[2] if len(parts) > 2 and parts[1] == "version" else first or None
    except Exception:
        return None


def install_hints() -> dict:
    if IS_WINDOWS:
        return {"ffmpeg": "winget install Gyan.FFmpeg", "jsRuntime": "winget install DenoLand.Deno"}
    if sys.platform == "darwin":
        return {"ffmpeg": "brew install ffmpeg", "jsRuntime": "brew install deno"}
    return {"ffmpeg": "sudo apt install ffmpeg", "jsRuntime": "curl -fsSL https://deno.land/install.sh | sh"}


def tools_status() -> dict:
    ffmpeg = find_ffmpeg()
    runtime = find_js_runtime()
    return {
        "ffmpeg": {"available": bool(ffmpeg), "path": ffmpeg, "version": _first_line_version(ffmpeg) if ffmpeg else None},
        "ffprobe": {"available": bool(find_ffprobe(ffmpeg))},
        "jsRuntime": {"name": runtime[0], "path": runtime[1]} if runtime else None,
        "ytdlp": {"available": ytdlp_version() is not None, "version": ytdlp_version()},
        "hints": install_hints(),
        "platform": sys.platform,
    }


# ── Processos ────────────────────────────────────────────────────────────────


def hidden_window_kwargs() -> dict:
    # O agente pode rodar pelo pythonw.exe: sem isto cada ffmpeg abriria uma janela de console.
    if IS_WINDOWS:
        return {"creationflags": subprocess.CREATE_NO_WINDOW}
    return {}


def process_group_kwargs() -> dict:
    """Processo em grupo próprio, para encerrar também os filhos (o yt-dlp chama o ffmpeg)."""
    if IS_WINDOWS:
        return {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


def subprocess_env() -> dict:
    env = dict(os.environ)
    # Saída do yt-dlp em UTF-8 (títulos com acentos) mesmo no console do Windows.
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def kill_tree(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    try:
        if IS_WINDOWS:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(process.pid)], capture_output=True, timeout=10, **hidden_window_kwargs()
            )
        else:
            os.killpg(process.pid, signal.SIGTERM)
    except Exception:
        pass
    try:
        process.wait(timeout=5)
    except Exception:
        try:
            process.kill()
        except Exception:
            pass
