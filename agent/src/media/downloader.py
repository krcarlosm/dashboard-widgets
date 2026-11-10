"""Downloader de vídeos e áudios com o yt-dlp.

O yt-dlp roda como subprocesso (`python -m yt_dlp`). Os parâmetros vêm de um
modelo validado — o navegador nunca envia argumentos de linha de comando
livres (opções como --exec executariam programas). O link vai sempre depois
de `--`, para não ser lido como opção.

Arquivos intermediários (.part, fragmentos, áudio/vídeo separados) ficam numa
pasta temporária da tarefa; só o resultado final vai para a pasta de destino.
"""

import importlib
import json
import re
import subprocess
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

from src.media.jobs import JobFailed, JobHandle, describe_output
from src.media.tools import (
    find_ffmpeg,
    find_js_runtime,
    hidden_window_kwargs,
    python_executable,
    subprocess_env,
    ytdlp_version,
)

TIME_PATTERN = re.compile(r"^\d{1,2}(:\d{2}){0,2}$")

FILENAME_TEMPLATES = {
    "title": "%(title)s.%(ext)s",
    "uploader-title": "%(uploader,channel|Desconhecido)s - %(title)s.%(ext)s",
    "date-title": "%(upload_date>%Y-%m-%d|sem data)s - %(title)s.%(ext)s",
    "index-title": "%(playlist_index&{} - |)s%(title)s.%(ext)s",
}

SUB_LANGS = {"pt": "pt.*", "en": "en.*", "pt,en": "pt.*,en.*", "all": "all,-live_chat"}


class DownloadOptions(BaseModel):
    # Modo simples
    mode: Literal["video", "audio", "videoonly"] = "video"
    videoFormat: Literal["mp4", "mkv", "webm"] = "mp4"
    audioFormat: Literal["mp3", "m4a", "opus", "wav", "flac"] = "mp3"
    quality: Literal["best", "2160", "1440", "1080", "720", "480", "360", "240"] = "best"
    audioQuality: Literal["best", "320", "192", "128"] = "best"
    # Modo avançado
    playlist: bool = False
    subtitles: bool = False
    autoSubtitles: bool = False
    subLangs: Literal["pt", "en", "pt,en", "all"] = "pt,en"
    embedThumbnail: bool = False
    embedMetadata: bool = True
    embedChapters: bool = False
    sponsorBlock: bool = False
    rateLimit: Literal["", "500K", "1M", "2M", "5M", "10M"] = ""
    filenameTemplate: Literal["title", "uploader-title", "date-title", "index-title"] = "title"
    restrictFilenames: bool = False
    sectionStart: str = ""
    sectionEnd: str = ""

    @field_validator("sectionStart", "sectionEnd")
    @classmethod
    def _time(cls, value: str) -> str:
        value = value.strip()
        if value and not TIME_PATTERN.match(value):
            raise ValueError("Use o formato HH:MM:SS, MM:SS ou segundos")
        return value


class UrlPayload(BaseModel):
    url: str = Field(max_length=2048)
    playlist: bool = False


class DownloadRequest(BaseModel):
    url: str = Field(max_length=2048)
    title: Optional[str] = Field(default=None, max_length=300)
    options: DownloadOptions = DownloadOptions()


def validate_url(url: str) -> str:
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or any(ch.isspace() for ch in url):
        raise ValueError("Informe um link http(s) válido.")
    return url


def summarize(options: DownloadOptions) -> str:
    if options.mode == "audio":
        quality = "" if options.audioQuality == "best" or options.audioFormat in ("wav", "flac") else f" · {options.audioQuality} kbps"
        return f"Áudio {options.audioFormat.upper()}{quality}"
    label = "Vídeo" if options.mode == "video" else "Só vídeo"
    quality = "melhor qualidade" if options.quality == "best" else f"até {options.quality}p"
    return f"{label} {options.videoFormat.upper()} · {quality}"


def _js_runtime_args() -> list[str]:
    runtime = find_js_runtime()
    return ["--js-runtimes", f"{runtime[0]}:{runtime[1]}"] if runtime else []


def _ffmpeg_args() -> list[str]:
    ffmpeg = find_ffmpeg()
    return ["--ffmpeg-location", ffmpeg] if ffmpeg else []


def build_download_args(url: str, options: DownloadOptions, out_dir: Path, temp_dir: Path) -> list[str]:
    template = FILENAME_TEMPLATES[options.filenameTemplate]
    if options.playlist:
        template = "%(playlist_title,playlist_id|Playlist)s/" + template

    args = [
        python_executable(), "-m", "yt_dlp",
        "--ignore-config", "--no-color", "--newline", "--progress", "--no-simulate", "--no-mtime",
        "--print", "before_dl:FMT %(format_id)s|%(playlist_index|1)s|%(n_entries|1)s|%(title)s",
        "--print", "after_move:DONE %(filepath)s",
        "--progress-template",
        "download:PROG %(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s"
        "|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s",
        "-P", f"home:{out_dir}", "-P", f"temp:{temp_dir}", "-o", template,
        "--yes-playlist" if options.playlist else "--no-playlist",
    ]
    args += _ffmpeg_args() + _js_runtime_args()

    sort: list[str] = []
    if options.mode in ("video", "videoonly") and options.quality != "best":
        sort.append(f"res:{options.quality}")

    if options.mode == "audio":
        args += ["-f", "ba/b", "-x", "--audio-format", options.audioFormat]
        args += ["--audio-quality", "0" if options.audioQuality == "best" else f"{options.audioQuality}K"]
    else:
        if options.videoFormat == "mp4":
            sort.append("ext:mp4:m4a")  # H.264/AAC: abre em qualquer player
        elif options.videoFormat == "webm":
            sort.append("ext:webm:webm")
        if options.mode == "video":
            args += ["-f", "bv*+ba/b", "--merge-output-format", options.videoFormat]
        else:
            args += ["-f", "bv/bv*", "--remux-video", options.videoFormat]
    if sort:
        args += ["-S", ",".join(sort)]

    if options.mode != "audio" and (options.subtitles or options.autoSubtitles):
        args += ["--sub-langs", SUB_LANGS[options.subLangs], "--embed-subs"]
        args += ["--write-subs"] if options.subtitles else []
        args += ["--write-auto-subs"] if options.autoSubtitles else []
    if options.embedThumbnail:
        args.append("--embed-thumbnail")
    if options.embedMetadata:
        args.append("--embed-metadata")
    if options.embedChapters and options.mode != "audio":
        args.append("--embed-chapters")
    if options.sponsorBlock:
        args += ["--sponsorblock-remove", "sponsor"]
    if options.rateLimit:
        args += ["--limit-rate", options.rateLimit]
    if options.restrictFilenames:
        args.append("--restrict-filenames")
    if options.sectionStart or options.sectionEnd:
        args += ["--download-sections", f"*{options.sectionStart or '0'}-{options.sectionEnd or 'inf'}"]

    return args + ["--", url]


# ── Erros ────────────────────────────────────────────────────────────────────

FRIENDLY_ERRORS = [
    ("Unsupported URL", "Este link não é suportado pelo yt-dlp."),
    ("Video unavailable", "Vídeo indisponível (removido, privado ou bloqueado na região)."),
    ("Private video", "Vídeo privado."),
    ("Sign in to confirm", "O site pediu login para este vídeo (restrição de idade ou verificação)."),
    ("HTTP Error 403", "O site recusou o download (HTTP 403). Tente atualizar o yt-dlp."),
    ("HTTP Error 404", "Endereço não encontrado (HTTP 404)."),
    ("getaddrinfo failed", "Sem conexão com o site (verifique a internet ou o proxy)."),
    ("Name or service not known", "Sem conexão com o site (verifique a internet ou o proxy)."),
    ("ffmpeg is not installed", "Este download precisa do ffmpeg (para juntar ou converter). Instale-o e tente de novo."),
    ("ffprobe and ffmpeg not found", "Este download precisa do ffmpeg (para juntar ou converter). Instale-o e tente de novo."),
]


def friendly_error(lines: list[str]) -> str:
    errors = [line for line in lines if line.startswith("ERROR:")]
    text = (errors[-1] if errors else (lines[-1] if lines else "O yt-dlp terminou com erro.")).removeprefix("ERROR:").strip()
    for needle, message in FRIENDLY_ERRORS:
        if needle.lower() in text.lower():
            return message
    return text[:400]


# ── Pré-visualização ─────────────────────────────────────────────────────────


def _thumbnail(info: dict) -> Optional[str]:
    if isinstance(info.get("thumbnail"), str):
        return info["thumbnail"]
    thumbs = [t for t in info.get("thumbnails") or [] if isinstance(t, dict) and t.get("url")]
    return thumbs[-1]["url"] if thumbs else None


def preview(url: str, playlist: bool = False, timeout: int = 60) -> dict:
    url = validate_url(url)
    cmd = [
        python_executable(), "-m", "yt_dlp", "--ignore-config", "--no-warnings", "-J", "--flat-playlist",
        "--yes-playlist" if playlist else "--no-playlist",
        *_js_runtime_args(), "--", url,
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
            env=subprocess_env(), **hidden_window_kwargs(),
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError("O site demorou demais para responder.") from exc
    if result.returncode != 0:
        raise ValueError(friendly_error((result.stderr or "").splitlines()))
    try:
        info = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ValueError("Resposta inesperada do yt-dlp.") from exc

    if info.get("_type") == "playlist":
        entries = [entry for entry in info.get("entries") or [] if isinstance(entry, dict)]
        durations = [entry.get("duration") for entry in entries]
        return {
            "kind": "playlist",
            "url": url,
            "title": info.get("title") or "Playlist",
            "uploader": info.get("uploader") or info.get("channel"),
            "count": info.get("playlist_count") or len(entries),
            "duration": sum(durations) if durations and all(isinstance(d, (int, float)) for d in durations) else None,
            "thumbnail": _thumbnail(info) or next((_thumbnail(entry) for entry in entries if _thumbnail(entry)), None),
            "entries": [{"title": entry.get("title"), "duration": entry.get("duration")} for entry in entries[:5]],
            "extractor": info.get("extractor_key"),
        }

    heights = sorted({f["height"] for f in info.get("formats") or [] if isinstance(f, dict) and isinstance(f.get("height"), int)}, reverse=True)
    return {
        "kind": "video",
        "url": url,
        "title": info.get("title") or "Sem título",
        "uploader": info.get("uploader") or info.get("channel"),
        "duration": info.get("duration"),
        "thumbnail": _thumbnail(info),
        "heights": heights,
        "isLive": bool(info.get("is_live")),
        "extractor": info.get("extractor_key"),
    }


# ── Download ─────────────────────────────────────────────────────────────────


def _number(value: str) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


ALREADY_DOWNLOADED = re.compile(r"^\[download\] (.+) has already been downloaded$")


def run_download(handle: JobHandle, url: str, options: DownloadOptions, out_dir: Path, temp_dir: Path) -> list:
    out_dir.mkdir(parents=True, exist_ok=True)
    temp_dir.mkdir(parents=True, exist_ok=True)
    state = {"streams": 1, "stream": 0, "index": 1, "count": 1}
    outputs: list[str] = []
    lines: list[str] = []

    def overall(fraction_of_item: float) -> float:
        return round(min(99.0, ((state["index"] - 1) + fraction_of_item) / max(1, state["count"]) * 100), 1)

    def on_line(line: str) -> None:
        if line.startswith("FMT "):
            format_id, index, count = (line[4:].split("|", 3) + ["", "", ""])[:3]
            state.update(streams=format_id.count("+") + 1, stream=0, index=int(_number(index) or 1), count=int(_number(count) or 1))
            item = f"{state['index']}/{state['count']}" if state["count"] > 1 else None
            handle.update(status="running", stage="Baixando", item=item, progress=overall(0))
        elif line.startswith("PROG "):
            status, done, total, estimate, speed, eta = (line[5:].split("|") + [""] * 6)[:6]
            if status == "downloading":
                size = _number(total) or _number(estimate)
                fraction = min(1.0, (_number(done) or 0) / size) if size else 0.0
                eta_value = _number(eta)
                handle.update(
                    stage="Baixando",
                    progress=overall((state["stream"] + fraction) / state["streams"]),
                    speed=_number(speed),
                    eta=int(eta_value) if eta_value is not None else None,
                )
            elif status == "finished":
                state["stream"] += 1
                if state["stream"] >= state["streams"]:
                    handle.update(status="processing", stage="Processando", speed=None, eta=None, progress=overall(1))
        elif line.startswith("DONE "):
            outputs.append(line[5:].strip())
        else:
            match = ALREADY_DOWNLOADED.match(line)
            if match:
                outputs.append(match.group(1).strip())
            lines.append(line)
            del lines[:-20]

    handle.update(stage="Iniciando", progress=None)
    code = handle.run_process(build_download_args(url, options, out_dir, temp_dir), on_line)
    existing = [Path(path) for path in dict.fromkeys(outputs) if Path(path).is_file()]
    if code != 0 and not existing:
        raise JobFailed(friendly_error(lines))
    if not existing:
        raise JobFailed(friendly_error(lines) if lines else "Nenhum arquivo foi gerado.")
    return [describe_output(path) for path in existing]


def update_ytdlp() -> dict:
    before = ytdlp_version()
    result = subprocess.run(
        [python_executable(), "-m", "pip", "install", "--upgrade", "--disable-pip-version-check", "yt-dlp[default]"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600,
        env=subprocess_env(), **hidden_window_kwargs(),
    )
    if result.returncode != 0:
        tail = (result.stderr or result.stdout or "").strip().splitlines()[-3:]
        raise RuntimeError("Falha ao atualizar o yt-dlp: " + " ".join(tail))
    importlib.invalidate_caches()
    after = ytdlp_version()
    return {"before": before, "after": after, "updated": before != after}
