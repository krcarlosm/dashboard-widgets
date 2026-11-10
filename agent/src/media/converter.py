"""Conversão e compactação de imagens (Pillow) e de vídeo/áudio (ffmpeg).

O arquivo chega por upload HTTP (gravado em pedaços numa pasta temporária do
agente) ou é a saída de uma tarefa anterior. O resultado é gerado na pasta
temporária e só então movido para a pasta de saída — cancelar ou falhar nunca
deixa arquivo pela metade na pasta do usuário.
"""

import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel

from src.media.jobs import JobFailed, JobHandle, describe_output
from src.media.tools import find_ffmpeg, find_ffprobe, hidden_window_kwargs, install_hints

IMAGE_FORMATS = ["png", "jpg", "webp", "bmp", "gif", "tiff", "ico"]
VIDEO_FORMATS = ["mp4", "mkv", "webm", "mov", "avi", "mpeg"]
AUDIO_FORMATS = ["mp3", "m4a", "aac", "ogg", "opus", "wav", "flac"]

# Extensões aceitas na entrada → formato "canônico" (usado ao compactar mantendo o formato).
INPUT_EXTENSIONS = {
    "image": {"png": "png", "jpg": "jpg", "jpeg": "jpg", "jfif": "jpg", "webp": "webp", "bmp": "bmp", "gif": "gif", "tif": "tiff", "tiff": "tiff", "ico": "ico"},
    "video": {
        "mp4": "mp4", "m4v": "mp4", "mkv": "mkv", "webm": "webm", "mov": "mov", "avi": "avi", "mpeg": "mpeg", "mpg": "mpeg",
        "wmv": None, "flv": None, "3gp": None, "ts": None, "mts": None, "m2ts": None, "ogv": None,
    },
    "audio": {
        "mp3": "mp3", "m4a": "m4a", "aac": "aac", "ogg": "ogg", "oga": "ogg", "opus": "opus", "wav": "wav", "flac": "flac",
        "wma": None, "amr": None, "aif": None, "aiff": None,
    },
}

Mode = Literal["convert", "compress", "both"]
Level = Literal["low", "medium", "high"]
Resolution = Literal["original", "2160p", "1440p", "1080p", "720p", "480p", "360p"]


class ConvertOptions(BaseModel):
    mode: Mode = "convert"
    targetFormat: Optional[str] = None
    level: Level = "medium"
    resolution: Resolution = "original"


@dataclass
class ConversionPlan:
    category: str
    target: str
    mode: str
    level: str
    resolution: str

    @property
    def quality_key(self) -> str:
        return "convert" if self.mode == "convert" else self.level

    @property
    def summary(self) -> str:
        parts = [self.target.upper()]
        if self.mode != "convert":
            parts.append({"low": "compactação leve", "medium": "compactação média", "high": "compactação alta"}[self.level])
        if self.category == "video" and self.target in VIDEO_FORMATS and self.resolution != "original":
            parts.append(self.resolution)
        return " · ".join(parts)


def extension_of(file_name: str) -> str:
    return Path(file_name).suffix.lower().lstrip(".")


def category_for(file_name: str) -> Optional[str]:
    ext = extension_of(file_name)
    for category, extensions in INPUT_EXTENSIONS.items():
        if ext in extensions:
            return category
    return None


def targets_for(category: str) -> list[str]:
    if category == "image":
        return IMAGE_FORMATS
    if category == "video":
        return VIDEO_FORMATS + AUDIO_FORMATS  # vídeo → áudio extrai a trilha
    if category == "audio":
        return AUDIO_FORMATS
    return []


def formats_catalog() -> dict:
    return {
        "image": {"inputs": sorted(INPUT_EXTENSIONS["image"]), "targets": targets_for("image")},
        "video": {"inputs": sorted(INPUT_EXTENSIONS["video"]), "targets": targets_for("video")},
        "audio": {"inputs": sorted(INPUT_EXTENSIONS["audio"]), "targets": targets_for("audio")},
    }


def plan_conversion(file_name: str, options: ConvertOptions) -> ConversionPlan:
    category = category_for(file_name)
    if category is None:
        raise ValueError(f"Formato não suportado: .{extension_of(file_name) or '?'}")
    if options.mode == "compress":
        target = INPUT_EXTENSIONS[category][extension_of(file_name)]
        if target is None:
            raise ValueError(f"Não dá para compactar mantendo .{extension_of(file_name)}; use Converter ou Ambos.")
    else:
        target = (options.targetFormat or "").lower().lstrip(".")
        target = {"jpeg": "jpg", "tif": "tiff", "mpg": "mpeg"}.get(target, target)
        if target not in targets_for(category):
            raise ValueError(f"Não é possível converter {category_label(category)} para {target.upper() or '?'}.")
    return ConversionPlan(category, target, options.mode, options.level, options.resolution)


def category_label(category: str) -> str:
    return {"image": "imagem", "video": "vídeo", "audio": "áudio"}.get(category, category)


def needs_ffmpeg(plan: ConversionPlan) -> bool:
    return plan.category in ("video", "audio")


def ffmpeg_missing_message() -> str:
    return f"ffmpeg não encontrado. Instale com “{install_hints()['ffmpeg']}” e tente de novo."


_UNSAFE_NAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def safe_file_name(name: str) -> str:
    name = _UNSAFE_NAME.sub("_", Path(name.replace("\\", "/")).name).strip(" .")
    if not name:
        return "arquivo"
    stem, dot, ext = name.rpartition(".")
    if dot and len(name) > 150:
        return stem[: 150 - len(ext) - 1] + "." + ext
    return name[:150]


def unique_path(directory: Path, name: str) -> Path:
    candidate = directory / name
    stem, suffix = Path(name).stem, Path(name).suffix
    counter = 2
    while candidate.exists():
        candidate = directory / f"{stem} ({counter}){suffix}"
        counter += 1
    return candidate


def output_name(file_name: str, plan: ConversionPlan) -> str:
    label = "_compactado" if plan.mode == "compress" else "_convertido"
    return f"{Path(file_name).stem}{label}.{plan.target}"


def run_conversion(handle: JobHandle, source: Path, file_name: str, plan: ConversionPlan, out_dir: Path, work_dir: Path) -> list:
    work_dir.mkdir(parents=True, exist_ok=True)
    temp_output = work_dir / f"saida.{plan.target}"
    if plan.category == "image":
        handle.update(stage="Convertendo imagem", progress=None)
        convert_image(source, temp_output, plan)
    else:
        convert_media(handle, source, temp_output, plan)
    handle.check()
    out_dir.mkdir(parents=True, exist_ok=True)
    final = unique_path(out_dir, output_name(file_name, plan))
    shutil.move(str(temp_output), final)
    return [describe_output(final)]


# ── Imagem ───────────────────────────────────────────────────────────────────

IMAGE_QUALITY = {"convert": 92, "low": 85, "medium": 72, "high": 55}
PIL_FORMATS = {"jpg": "JPEG", "png": "PNG", "webp": "WEBP", "bmp": "BMP", "gif": "GIF", "tiff": "TIFF", "ico": "ICO"}


def convert_image(source: Path, dest: Path, plan: ConversionPlan) -> None:
    from PIL import Image, ImageOps, UnidentifiedImageError

    try:
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened)
            image.load()
    except UnidentifiedImageError as exc:
        raise JobFailed("O arquivo não parece ser uma imagem válida.") from exc

    has_alpha = image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info)
    fmt = PIL_FORMATS[plan.target]
    quality = IMAGE_QUALITY[plan.quality_key]
    kwargs: dict = {}

    if fmt == "JPEG":
        if has_alpha:
            rgba = image.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.getchannel("A"))
            image = background
        else:
            image = image.convert("RGB")
        kwargs = {"quality": quality, "optimize": True, "progressive": True}
    elif fmt == "WEBP":
        image = image.convert("RGBA" if has_alpha else "RGB")
        kwargs = {"quality": quality, "method": 6}
    elif fmt == "PNG":
        if plan.mode != "convert" and plan.level == "high":
            image = image.convert("RGBA" if has_alpha else "RGB").quantize(256, method=Image.Quantize.FASTOCTREE)
        kwargs = {"optimize": True}
    elif fmt == "BMP":
        if image.mode not in ("1", "L", "P", "RGB", "RGBA"):
            image = image.convert("RGBA" if has_alpha else "RGB")
    elif fmt == "TIFF":
        kwargs = {"compression": "tiff_lzw"}
    elif fmt == "ICO":
        largest = max(image.size)
        kwargs = {"sizes": [(size, size) for size in (16, 24, 32, 48, 64, 128, 256) if size <= largest] or [(16, 16)]}

    image.save(dest, format=fmt, **kwargs)


# ── Vídeo / áudio ────────────────────────────────────────────────────────────

X264_CRF = {"convert": 20, "low": 23, "medium": 28, "high": 32}
VP9_CRF = {"convert": 31, "low": 34, "medium": 38, "high": 42}
MPEG_Q = {"convert": 3, "low": 5, "medium": 8, "high": 12}
AUDIO_BITRATE = {"convert": "192k", "low": "160k", "medium": "128k", "high": "96k"}
OPUS_BITRATE = {"convert": "128k", "low": "112k", "medium": "96k", "high": "64k"}


def audio_args(target: str, key: str) -> list[str]:
    if target == "mp3":
        return ["-c:a", "libmp3lame", "-b:a", AUDIO_BITRATE[key]]
    if target in ("m4a", "aac"):
        return ["-c:a", "aac", "-b:a", AUDIO_BITRATE[key]]
    if target == "ogg":
        return ["-c:a", "libvorbis", "-b:a", AUDIO_BITRATE[key]]
    if target == "opus":
        return ["-c:a", "libopus", "-b:a", OPUS_BITRATE[key]]
    if target == "wav":
        return ["-c:a", "pcm_s16le"]
    if target == "flac":
        return ["-c:a", "flac", "-compression_level", "5" if key == "convert" else "8"]
    raise ValueError(target)


def video_args(target: str, key: str) -> list[str]:
    if target in ("mp4", "mkv", "mov"):
        args = ["-c:v", "libx264", "-preset", "medium", "-crf", str(X264_CRF[key]), "-pix_fmt", "yuv420p"]
        args += ["-c:a", "aac", "-b:a", AUDIO_BITRATE[key]]
        if target in ("mp4", "mov"):
            args += ["-movflags", "+faststart"]
        return args
    if target == "webm":
        return [
            "-c:v", "libvpx-vp9", "-crf", str(VP9_CRF[key]), "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4",
            "-c:a", "libopus", "-b:a", OPUS_BITRATE[key],
        ]
    if target == "avi":
        return ["-c:v", "mpeg4", "-q:v", str(MPEG_Q[key]), "-c:a", "libmp3lame", "-b:a", AUDIO_BITRATE[key]]
    if target == "mpeg":
        return ["-c:v", "mpeg2video", "-q:v", str(MPEG_Q[key]), "-c:a", "mp2", "-b:a", "192k"]
    raise ValueError(target)


def build_ffmpeg_command(ffmpeg: str, source: Path, dest: Path, plan: ConversionPlan) -> list[str]:
    cmd = [ffmpeg, "-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", str(source)]
    key = plan.quality_key
    if plan.target in AUDIO_FORMATS:
        cmd += ["-vn", "-map", "0:a:0?"] + audio_args(plan.target, key)
    else:
        cmd += ["-map", "0:v:0", "-map", "0:a?"]
        if plan.resolution != "original":
            height = int(plan.resolution.rstrip("p"))
            # Nunca aumenta a resolução; altura par (exigência do H.264).
            cmd += ["-vf", f"scale=-2:'min({height},trunc(ih/2)*2)'"]
        cmd += video_args(plan.target, key)
    cmd += ["-map_metadata", "0", "-progress", "pipe:1", "-nostats", str(dest)]
    return cmd


def probe_duration(ffprobe: Optional[str], source: Path) -> Optional[float]:
    if not ffprobe:
        return None
    try:
        result = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(source)],
            capture_output=True, text=True, timeout=30, **hidden_window_kwargs(),
        )
        value = float(result.stdout.strip())
        return value if value > 0 else None
    except Exception:
        return None


_PROGRESS_LINE = re.compile(r"^(\w+)=(.*)$")


def convert_media(handle: JobHandle, source: Path, dest: Path, plan: ConversionPlan) -> None:
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise JobFailed(ffmpeg_missing_message())
    duration = probe_duration(find_ffprobe(ffmpeg), source)
    stage = "Extraindo áudio" if plan.category == "video" and plan.target in AUDIO_FORMATS else "Convertendo"
    handle.update(stage=stage, progress=0.0 if duration else None)

    errors: list[str] = []
    started = time.monotonic()

    def on_line(line: str) -> None:
        match = _PROGRESS_LINE.match(line)
        if not match:
            errors.append(line)
            del errors[:-8]
            return
        key, value = match.groups()
        if key in ("out_time_us", "out_time_ms") and duration and value.strip().isdigit():
            fraction = min(0.99, int(value) / 1_000_000 / duration)
            elapsed = time.monotonic() - started
            eta = int(elapsed * (1 - fraction) / fraction) if fraction > 0.02 else None
            handle.update(progress=round(fraction * 100, 1), eta=eta)

    code = handle.run_process(build_ffmpeg_command(ffmpeg, source, dest, plan), on_line)
    if code != 0 or not dest.exists():
        detail = errors[-1] if errors else f"código {code}"
        raise JobFailed(f"O ffmpeg não conseguiu converter o arquivo: {detail}")
