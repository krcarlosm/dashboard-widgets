import asyncio
import os
import shutil
import uuid
from pathlib import Path
from typing import Callable, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from starlette.requests import ClientDisconnect

from src.files import opener
from src.files.filters import is_executable
from src.media.converter import (
    ConvertOptions,
    Level,
    Mode,
    Resolution,
    ffmpeg_missing_message,
    formats_catalog,
    needs_ffmpeg,
    plan_conversion,
    run_conversion,
    safe_file_name,
)
from src.media.downloader import (
    DownloadRequest,
    UrlPayload,
    preview,
    run_download,
    summarize,
    update_ytdlp,
    validate_url,
)
from src.media.jobs import JobManager
from src.media.settings import MediaSettings
from src.media.tools import find_ffmpeg, tools_status, ytdlp_version

MAX_UPLOAD_BYTES = 20 * 1024**3


class SettingsPayload(BaseModel):
    downloadDir: Optional[str] = Field(default=None, max_length=1024)
    convertDir: Optional[str] = Field(default=None, max_length=1024)


class DirectoryPayload(BaseModel):
    which: Literal["download", "convert"]


class ConvertFilePayload(BaseModel):
    path: str = Field(max_length=4096)
    options: ConvertOptions = ConvertOptions()


def create_media_router(*, jobs: JobManager, settings: MediaSettings, work_root: Path, require_token: Callable) -> APIRouter:
    router = APIRouter(prefix="/media", dependencies=[Depends(require_token)])
    # Sobras de uma execução anterior (agente encerrado no meio de uma tarefa).
    shutil.rmtree(work_root, ignore_errors=True)
    work_root.mkdir(parents=True, exist_ok=True)

    def new_work_dir(prefix: str) -> Path:
        directory = work_root / f"{prefix}-{uuid.uuid4().hex[:12]}"
        directory.mkdir(parents=True)
        return directory

    def job_output(job_id: str, index: int) -> str:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Tarefa não encontrada")
        if job["status"] != "done" or index >= len(job["outputs"]):
            raise HTTPException(status_code=409, detail="A tarefa ainda não gerou arquivo")
        path = job["outputs"][index]["path"]
        if not os.path.isfile(path):
            raise HTTPException(status_code=410, detail="O arquivo foi movido ou apagado.")
        return path

    # ── ferramentas e configurações ──────────────────────────────────────────

    @router.get("/tools")
    async def get_tools():
        status = await asyncio.to_thread(tools_status)
        return {**status, "formats": formats_catalog()}

    @router.get("/settings")
    async def get_settings():
        return settings.to_dict()

    @router.put("/settings")
    async def put_settings(payload: SettingsPayload):
        try:
            await asyncio.to_thread(settings.update, payload.downloadDir, payload.convertDir)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        return settings.to_dict()

    @router.post("/open-directory")
    async def open_directory(payload: DirectoryPayload):
        directory = settings.ensure("downloadDir" if payload.which == "download" else "convertDir")
        await asyncio.to_thread(opener.open_file, str(directory))
        return {"directory": str(directory)}

    # ── tarefas ──────────────────────────────────────────────────────────────

    @router.get("/jobs")
    async def list_jobs(kind: Optional[Literal["convert", "download"]] = None):
        return {"items": jobs.list(kind)}

    @router.delete("/jobs")
    async def clear_jobs(kind: Optional[Literal["convert", "download"]] = None):
        return {"removed": jobs.clear_finished(kind)}

    @router.delete("/jobs/{job_id}")
    async def cancel_or_remove(job_id: str):
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Tarefa não encontrada")
        if jobs.remove(job_id):
            return {"removed": True, "job": job}
        return {"removed": False, "job": await asyncio.to_thread(jobs.cancel, job_id)}

    @router.post("/jobs/{job_id}/open")
    async def open_output(job_id: str, index: int = Query(0, ge=0)):
        path = job_output(job_id, index)
        action = opener.reveal_file if is_executable(path) else opener.open_file
        await asyncio.to_thread(action, path)
        return {"opened": path}

    @router.post("/jobs/{job_id}/reveal")
    async def reveal_output(job_id: str, index: int = Query(0, ge=0)):
        path = job_output(job_id, index)
        await asyncio.to_thread(opener.reveal_file, path)
        return {"revealed": path}

    # ── conversor ────────────────────────────────────────────────────────────

    def submit_conversion(source: Path, file_name: str, options: ConvertOptions, work_dir: Path):
        plan = plan_conversion(file_name, options)
        out_dir = settings.convert_dir
        return jobs.submit(
            "convert",
            title=file_name,
            summary=plan.summary,
            runner=lambda handle: run_conversion(handle, source, file_name, plan, out_dir, work_dir / "saida"),
            cleanup=lambda: shutil.rmtree(work_dir, ignore_errors=True),
        )

    @router.post("/convert")
    async def convert_upload(
        request: Request,
        fileName: str = Query(..., min_length=1, max_length=255),
        mode: Mode = "convert",
        targetFormat: Optional[str] = Query(None, max_length=10),
        level: Level = "medium",
        resolution: Resolution = "original",
    ):
        """Recebe o arquivo como corpo bruto da requisição, gravado em pedaços (sem base64, sem limite de memória)."""
        name = safe_file_name(fileName)
        options = ConvertOptions(mode=mode, targetFormat=targetFormat, level=level, resolution=resolution)
        try:
            plan = plan_conversion(name, options)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if needs_ffmpeg(plan) and not await asyncio.to_thread(find_ffmpeg):
            raise HTTPException(status_code=400, detail=ffmpeg_missing_message())

        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Arquivo grande demais (limite de 20 GB).")

        work_dir = new_work_dir("conv")
        source = work_dir / f"entrada{Path(name).suffix.lower()}"
        received = 0
        try:
            with open(source, "wb") as handle:
                async for chunk in request.stream():
                    received += len(chunk)
                    if received > MAX_UPLOAD_BYTES:
                        raise HTTPException(status_code=413, detail="Arquivo grande demais (limite de 20 GB).")
                    handle.write(chunk)
        except (ClientDisconnect, HTTPException, OSError) as exc:
            shutil.rmtree(work_dir, ignore_errors=True)
            if isinstance(exc, HTTPException):
                raise
            if isinstance(exc, OSError):
                raise HTTPException(status_code=500, detail=f"Não foi possível gravar o arquivo: {exc}")
            raise HTTPException(status_code=499, detail="Envio cancelado")
        if received == 0:
            shutil.rmtree(work_dir, ignore_errors=True)
            raise HTTPException(status_code=400, detail="Arquivo vazio.")
        return submit_conversion(source, name, options, work_dir)

    @router.post("/convert-file")
    async def convert_existing(payload: ConvertFilePayload):
        """Converte um arquivo já gerado pelo Downloader/Conversor (base do "Enviar para…")."""
        if not jobs.is_output(payload.path) or not os.path.isfile(payload.path):
            raise HTTPException(status_code=403, detail="Só é possível converter arquivos gerados pelo Downloader ou pelo Conversor.")
        name = Path(payload.path).name
        try:
            plan = plan_conversion(name, payload.options)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if needs_ffmpeg(plan) and not await asyncio.to_thread(find_ffmpeg):
            raise HTTPException(status_code=400, detail=ffmpeg_missing_message())
        return submit_conversion(Path(payload.path), name, payload.options, new_work_dir("conv"))

    # ── downloader ───────────────────────────────────────────────────────────

    def require_ytdlp() -> None:
        if ytdlp_version() is None:
            raise HTTPException(status_code=503, detail="yt-dlp não está instalado no agente (pip install -r requirements.txt).")

    @router.post("/download/preview")
    async def download_preview(payload: UrlPayload):
        require_ytdlp()
        try:
            return await asyncio.to_thread(preview, payload.url, payload.playlist)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @router.post("/download")
    async def download(payload: DownloadRequest):
        require_ytdlp()
        try:
            url = validate_url(payload.url)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        options = payload.options
        out_dir = settings.download_dir
        work_dir = new_work_dir("dl")
        return jobs.submit(
            "download",
            title=(payload.title or url).strip(),
            summary=summarize(options),
            runner=lambda handle: run_download(handle, url, options, out_dir, work_dir),
            cleanup=lambda: shutil.rmtree(work_dir, ignore_errors=True),
        )

    @router.post("/ytdlp/update")
    async def ytdlp_update():
        if jobs.has_active("download"):
            raise HTTPException(status_code=409, detail="Aguarde os downloads em andamento terminarem para atualizar.")
        try:
            return await asyncio.to_thread(update_ytdlp)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    return router
