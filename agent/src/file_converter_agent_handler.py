"""
file_converter_agent_handler.py

Handler para o comando "file-converter:convert" recebido do widget
FileConverterWidget.tsx via WebSocket.

Integração no Agent (esboço):

    from file_converter_agent_handler import handle_file_converter_convert

    COMMAND_HANDLERS = {
        # ...outros handlers já existentes...
        "file-converter:convert": handle_file_converter_convert,
    }

    # no dispatcher do WebSocket:
    async def on_message(websocket, raw_message):
        message = json.loads(raw_message)
        handler = COMMAND_HANDLERS.get(message["type"])
        if handler:
            await handler(message["payload"], send_event=make_sender(websocket))

Dependências:
    pip install Pillow
    # ffmpeg precisa estar instalado no sistema e disponível no PATH
    #   Ubuntu/Zorin: sudo apt install ffmpeg
    #   Windows: choco install ffmpeg  (ou baixar build oficial e adicionar ao PATH)

Protocolo de eventos emitidos de volta ao widget (via send_event):
    "file-converter:progress"  {requestId, percent}
    "file-converter:done"      {requestId, outputPath, fileName, sizeBytes}
    "file-converter:error"     {requestId, message}
"""

from __future__ import annotations

import asyncio
import base64
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

try:
    from PIL import Image
except ImportError:  # Pillow é opcional se o Agent só processar vídeo/áudio
    Image = None  # type: ignore

SendEvent = Callable[[str, dict], Awaitable[None]]

DOWNLOADS_DIR = Path.home() / "Downloads"

# ffmpeg -crf: menor = melhor qualidade / maior arquivo
CRF_BY_LEVEL = {"none": 18, "low": 20, "medium": 26, "high": 32}
# bitrate de áudio por nível
ABITRATE_BY_LEVEL = {"none": "256k", "low": "192k", "medium": "128k", "high": "96k"}
# imagem: quality do Pillow (JPEG/WebP)
IMG_QUALITY_BY_LEVEL = {"none": 95, "low": 85, "medium": 70, "high": 50}

RESOLUTION_HEIGHTS = {"1080p": 1080, "720p": 720, "480p": 480}


class ConversionError(Exception):
    pass


async def handle_file_converter_convert(payload: dict, send_event: SendEvent) -> None:
    """Ponto de entrada chamado pelo dispatcher do Agent."""
    request_id = payload.get("requestId", "unknown")
    try:
        category = payload["category"]  # 'image' | 'video' | 'audio'
        file_name = payload["fileName"]
        mode = payload.get("mode", "convert")  # 'convert' | 'compress' | 'both'
        target_format = payload.get("targetFormat") or Path(file_name).suffix.lstrip(".")
        compression_level = payload.get("compressionLevel", "medium")
        resolution = payload.get("resolution", "original")

        source_path, cleanup_source = await _resolve_source_path(payload, file_name)

        try:
            if category == "image":
                if Image is None:
                    raise ConversionError("Pillow não está instalado no ambiente do Agent (pip install Pillow).")
                output_path = _convert_image(source_path, file_name, target_format, compression_level)
            elif category in ("video", "audio"):
                if shutil.which("ffmpeg") is None:
                    raise ConversionError(
                        "ffmpeg não encontrado no PATH do sistema. Instale-o para habilitar conversão de "
                        "vídeo/áudio (ex.: 'sudo apt install ffmpeg' ou 'choco install ffmpeg')."
                    )
                output_path = await _convert_media_ffmpeg(
                    source_path=source_path,
                    file_name=file_name,
                    category=category,
                    mode=mode,
                    target_format=target_format,
                    compression_level=compression_level,
                    resolution=resolution,
                    request_id=request_id,
                    send_event=send_event,
                )
            else:
                raise ConversionError(f"Categoria de arquivo não suportada: {category}")

            await send_event("file-converter:done", {
                "requestId": request_id,
                "outputPath": str(output_path),
                "fileName": output_path.name,
                "sizeBytes": output_path.stat().st_size,
            })
        finally:
            if cleanup_source:
                source_path.unlink(missing_ok=True)

    except ConversionError as e:
        await send_event("file-converter:error", {"requestId": request_id, "message": str(e)})
    except Exception as e:  # segurança: nunca deixar o Agent cair por causa de um comando
        await send_event("file-converter:error", {
            "requestId": request_id,
            "message": f"Erro inesperado durante a conversão: {e}",
        })


# ----------------------------------------------------------------------------
# Resolução da origem do arquivo: caminho direto (Electron) ou base64 (browser)
# ----------------------------------------------------------------------------

async def _resolve_source_path(payload: dict, file_name: str) -> tuple[Path, bool]:
    source_path = payload.get("sourcePath")
    if source_path:
        path = Path(source_path)
        if not path.exists():
            raise ConversionError(f"Arquivo de origem não encontrado: {source_path}")
        return path, False  # não deletar arquivo original do usuário

    source_b64 = payload.get("sourceBase64")
    if source_b64:
        suffix = Path(file_name).suffix
        tmp = Path(tempfile.gettempdir()) / f"file_converter_src_{next(tempfile._get_candidate_names())}{suffix}"
        tmp.write_bytes(base64.b64decode(source_b64))
        return tmp, True  # limpar depois, é uma cópia temporária

    raise ConversionError("Nenhuma origem de arquivo fornecida (sourcePath ou sourceBase64).")


def _output_path_for(file_name: str, target_format: str) -> Path:
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    stem = Path(file_name).stem
    candidate = DOWNLOADS_DIR / f"{stem}_convertido.{target_format}"
    # evita sobrescrever arquivos existentes
    i = 1
    while candidate.exists():
        candidate = DOWNLOADS_DIR / f"{stem}_convertido_{i}.{target_format}"
        i += 1
    return candidate


# ----------------------------------------------------------------------------
# Imagem (Pillow)
# ----------------------------------------------------------------------------

def _convert_image(source_path: Path, file_name: str, target_format: str, level: str) -> Path:
    target_format = "jpeg" if target_format in ("jpg", "jpeg") else target_format
    output_path = _output_path_for(file_name, "jpg" if target_format == "jpeg" else target_format)

    with Image.open(source_path) as img:
        if target_format == "jpeg" and img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        save_kwargs: dict[str, Any] = {}
        if target_format in ("jpeg", "webp"):
            save_kwargs["quality"] = IMG_QUALITY_BY_LEVEL.get(level, 85)
            save_kwargs["optimize"] = True
        elif target_format == "png":
            save_kwargs["optimize"] = True

        img.save(output_path, format=target_format.upper(), **save_kwargs)

    return output_path


# ----------------------------------------------------------------------------
# Vídeo/Áudio (ffmpeg via subprocess, com progresso)
# ----------------------------------------------------------------------------

async def _convert_media_ffmpeg(
    *,
    source_path: Path,
    file_name: str,
    category: str,
    mode: str,
    target_format: str,
    compression_level: str,
    resolution: str,
    request_id: str,
    send_event: SendEvent,
) -> Path:
    output_path = _output_path_for(file_name, target_format)
    duration = await _probe_duration_seconds(source_path)

    cmd = ["ffmpeg", "-y", "-i", str(source_path)]

    if category == "video":
        if mode in ("compress", "both"):
            cmd += ["-crf", str(CRF_BY_LEVEL.get(compression_level, 26)), "-preset", "medium"]
        height = RESOLUTION_HEIGHTS.get(resolution)
        if height:
            cmd += ["-vf", f"scale=-2:{height}"]
        cmd += ["-c:v", _video_codec_for(target_format), "-c:a", "aac"]
    else:  # audio
        if mode in ("compress", "both"):
            cmd += ["-b:a", ABITRATE_BY_LEVEL.get(compression_level, "128k")]
        cmd += ["-vn"]

    cmd += ["-progress", "pipe:1", "-nostats", str(output_path)]

    process = await asyncio.create_subprocess_exec(
        *cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )

    assert process.stdout is not None
    async for line in process.stdout:
        text = line.decode(errors="ignore").strip()
        match = re.match(r"out_time_ms=(\d+)", text)
        if match and duration:
            elapsed_seconds = int(match.group(1)) / 1_000_000
            percent = min(99, int((elapsed_seconds / duration) * 100))
            await send_event("file-converter:progress", {"requestId": request_id, "percent": percent})

    return_code = await process.wait()
    if return_code != 0:
        stderr = (await process.stderr.read()).decode(errors="ignore") if process.stderr else ""
        output_path.unlink(missing_ok=True)
        raise ConversionError(f"ffmpeg falhou (código {return_code}): {stderr[-500:]}")

    return output_path


def _video_codec_for(target_format: str) -> str:
    # containers como 3gp/mpeg têm requisitos de codec específicos
    if target_format == "3gp":
        return "h263"
    if target_format == "mpeg":
        return "mpeg2video"
    return "libx264"


async def _probe_duration_seconds(source_path: Path) -> Optional[float]:
    """Usa ffprobe (parte do pacote ffmpeg) para estimar duração, usado no cálculo de progresso."""
    if shutil.which("ffprobe") is None:
        return None
    process = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(source_path),
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    stdout, _ = await process.communicate()
    try:
        return float(stdout.decode().strip())
    except (ValueError, AttributeError):
        return None
