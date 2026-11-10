"""Fila de tarefas do Conversor e do Downloader.

Cada tipo ("convert", "download") tem a sua fila e uma thread que executa uma
tarefa por vez. As tarefas rodam fora do event loop do servidor (são
subprocessos longos: ffmpeg, yt-dlp), e cada mudança de estado é avisada pelo
callback `notify` — o main.py repassa como evento `media:job` no WebSocket.

Cancelar uma tarefa na fila só a marca; uma em execução tem o processo (e os
filhos dele) encerrado.
"""

import logging
import os
import queue
import subprocess
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, Optional

from src.media.tools import kill_tree, process_group_kwargs, subprocess_env

logger = logging.getLogger("LocalAgent.media")

FINAL_STATUSES = {"done", "error", "canceled"}
NOTIFY_INTERVAL = 0.25


class JobCanceled(Exception):
    pass


class JobFailed(Exception):
    """Falha com mensagem pronta para o usuário."""


@dataclass
class Job:
    id: str
    kind: str
    title: str
    summary: str = ""
    status: str = "queued"  # queued | running | processing | done | error | canceled
    progress: Optional[float] = 0.0  # 0–100; None = sem estimativa
    stage: str = ""
    speed: Optional[float] = None  # bytes/s
    eta: Optional[int] = None  # segundos
    item: Optional[str] = None  # "2/10" em playlists
    outputs: list = field(default_factory=list)  # [{path, name, size}]
    error: Optional[str] = None
    createdAt: float = field(default_factory=time.time)
    finishedAt: Optional[float] = None

    def to_dict(self) -> dict:
        return asdict(self)


def describe_output(path: Path) -> dict:
    try:
        size = path.stat().st_size
    except OSError:
        size = None
    return {"path": str(path), "name": path.name, "size": size}


class JobHandle:
    """O que a função da tarefa enxerga: atualizar progresso, rodar processos, checar cancelamento."""

    def __init__(self, manager: "JobManager", job: Job):
        self._manager = manager
        self.job_id = job.id
        self.cancel_event = threading.Event()
        self.process: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()

    @property
    def canceled(self) -> bool:
        return self.cancel_event.is_set()

    def check(self) -> None:
        if self.canceled:
            raise JobCanceled()

    def update(self, **fields) -> None:
        self._manager._update(self.job_id, fields)

    def run_process(self, cmd: list[str], on_line: Callable[[str], None], cwd: Optional[Path] = None) -> int:
        """Executa e entrega cada linha da saída (stdout + stderr) a `on_line`. Devolve o código de saída."""
        self.check()
        process = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            cwd=str(cwd) if cwd else None,
            env=subprocess_env(),
            **process_group_kwargs(),
        )
        with self._lock:
            self.process = process
        if self.canceled:
            kill_tree(process)
        try:
            assert process.stdout is not None
            for raw in process.stdout:
                line = raw.rstrip("\r\n")
                if line:
                    on_line(line)
            code = process.wait()
        finally:
            with self._lock:
                self.process = None
        self.check()
        return code

    def kill(self) -> None:
        with self._lock:
            process = self.process
        if process is not None:
            kill_tree(process)


Runner = Callable[[JobHandle], list]


class JobManager:
    def __init__(self, notify: Optional[Callable[[dict], None]] = None, keep_finished: int = 40):
        self.notify = notify
        self.keep_finished = keep_finished
        self._jobs: dict[str, Job] = {}
        self._handles: dict[str, JobHandle] = {}
        self._runners: dict[str, Runner] = {}
        self._cleanups: dict[str, Callable[[], None]] = {}
        self._queues: dict[str, queue.Queue] = {}
        self._workers: dict[str, threading.Thread] = {}
        self._last_notify: dict[str, float] = {}
        self._pending: dict[str, threading.Timer] = {}
        self._lock = threading.RLock()

    # ── consulta ─────────────────────────────────────────────────────────────

    def list(self, kind: Optional[str] = None) -> list[dict]:
        with self._lock:
            jobs = [job for job in self._jobs.values() if kind is None or job.kind == kind]
            return [job.to_dict() for job in sorted(jobs, key=lambda job: job.createdAt, reverse=True)]

    def get(self, job_id: str) -> Optional[dict]:
        with self._lock:
            job = self._jobs.get(job_id)
            return job.to_dict() if job else None

    def has_active(self, kind: str) -> bool:
        with self._lock:
            return any(job.kind == kind and job.status not in FINAL_STATUSES for job in self._jobs.values())

    def output_paths(self) -> set[str]:
        """Arquivos gerados por tarefas concluídas (os únicos que a API deixa abrir)."""
        with self._lock:
            return {
                os.path.normcase(os.path.abspath(output["path"]))
                for job in self._jobs.values()
                if job.status == "done"
                for output in job.outputs
            }

    def is_output(self, path: str) -> bool:
        return os.path.normcase(os.path.abspath(path)) in self.output_paths()

    # ── ciclo de vida ────────────────────────────────────────────────────────

    def submit(
        self,
        kind: str,
        title: str,
        runner: Runner,
        summary: str = "",
        cleanup: Optional[Callable[[], None]] = None,
    ) -> dict:
        job = Job(id=uuid.uuid4().hex[:12], kind=kind, title=title, summary=summary)
        with self._lock:
            self._jobs[job.id] = job
            self._handles[job.id] = JobHandle(self, job)
            self._runners[job.id] = runner
            if cleanup:
                self._cleanups[job.id] = cleanup
            self._prune()
            work_queue = self._queues.setdefault(kind, queue.Queue())
            worker = self._workers.get(kind)
            if worker is None or not worker.is_alive():
                worker = threading.Thread(target=self._work, args=(kind,), name=f"media-{kind}", daemon=True)
                self._workers[kind] = worker
                worker.start()
        work_queue.put(job.id)
        self._emit(job.id, force=True)
        return job.to_dict()

    def cancel(self, job_id: str) -> Optional[dict]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job.status in FINAL_STATUSES:
                return job.to_dict()
            handle = self._handles[job_id]
            handle.cancel_event.set()
            if job.status == "queued":
                job.status = "canceled"
                job.stage = ""
                job.finishedAt = time.time()
        handle.kill()
        self._emit(job_id, force=True)
        return self.get(job_id)

    def remove(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job.status not in FINAL_STATUSES:
                return False
            self._forget(job_id)
            return True

    def clear_finished(self, kind: Optional[str] = None) -> int:
        with self._lock:
            ids = [job.id for job in self._jobs.values() if job.status in FINAL_STATUSES and (kind is None or job.kind == kind)]
            for job_id in ids:
                self._forget(job_id)
            return len(ids)

    def shutdown(self) -> None:
        with self._lock:
            active = [job.id for job in self._jobs.values() if job.status not in FINAL_STATUSES]
        for job_id in active:
            self.cancel(job_id)

    def wait(self, job_id: str, timeout: float = 30) -> Optional[dict]:
        """Espera a tarefa terminar (usado nos testes)."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            job = self.get(job_id)
            if job is None or job["status"] in FINAL_STATUSES:
                return job
            time.sleep(0.05)
        return self.get(job_id)

    # ── interno ──────────────────────────────────────────────────────────────

    def _forget(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)
        self._handles.pop(job_id, None)
        self._runners.pop(job_id, None)
        self._cleanups.pop(job_id, None)
        self._last_notify.pop(job_id, None)

    def _prune(self) -> None:
        finished = sorted(
            (job for job in self._jobs.values() if job.status in FINAL_STATUSES), key=lambda job: job.finishedAt or 0
        )
        for job in finished[: max(0, len(finished) - self.keep_finished)]:
            self._forget(job.id)

    def _update(self, job_id: str, fields: dict) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            for key, value in fields.items():
                setattr(job, key, value)
        # Progresso é avisado no máximo 4×/s; mudanças de estado, sempre.
        self._emit(job_id, force="status" in fields)

    def _emit(self, job_id: str, force: bool = False) -> None:
        if self.notify is None:
            return
        now = time.monotonic()
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            elapsed = now - self._last_notify.get(job_id, 0)
            if not force and elapsed < NOTIFY_INTERVAL:
                # Garante que a última mudança chegue, mesmo que nada mais aconteça depois.
                if job_id not in self._pending:
                    timer = threading.Timer(NOTIFY_INTERVAL - elapsed, self._flush, args=(job_id,))
                    timer.daemon = True
                    self._pending[job_id] = timer
                    timer.start()
                return
            self._last_notify[job_id] = now
            payload = job.to_dict()
        try:
            self.notify(payload)
        except Exception:
            logger.exception("Falha ao avisar mudança da tarefa %s", job_id)

    def _flush(self, job_id: str) -> None:
        with self._lock:
            self._pending.pop(job_id, None)
        self._emit(job_id, force=True)

    def _work(self, kind: str) -> None:
        work_queue = self._queues[kind]
        while True:
            job_id = work_queue.get()
            with self._lock:
                job = self._jobs.get(job_id)
                handle = self._handles.get(job_id)
                runner = self._runners.pop(job_id, None)
                cleanup = self._cleanups.pop(job_id, None)
                skip = job is None or job.status != "queued" or handle is None or runner is None
                if not skip:
                    job.status = "running"
            result = None
            if not skip:
                self._emit(job_id, force=True)
                result = self._run(job_id, handle, runner)
            # Arquivos temporários saem antes de a tarefa aparecer como concluída.
            if cleanup:
                try:
                    cleanup()
                except Exception:
                    logger.exception("Falha ao limpar arquivos temporários da tarefa %s", job_id)
            if result is not None:
                self._update(job_id, result)

    def _run(self, job_id: str, handle: JobHandle, runner: Runner) -> dict:
        cleared = {"stage": "", "eta": None, "speed": None, "finishedAt": None}
        try:
            outputs = runner(handle) or []
            handle.check()
            result = {**cleared, "status": "done", "progress": 100.0, "outputs": outputs}
        except JobCanceled:
            result = {**cleared, "status": "canceled"}
        except JobFailed as exc:
            result = {**cleared, "status": "error", "error": str(exc)}
        except Exception as exc:
            if handle.canceled:
                result = {**cleared, "status": "canceled"}
            else:
                logger.exception("Tarefa %s falhou", job_id)
                result = {**cleared, "status": "error", "error": f"Erro inesperado: {exc}"}
        result["finishedAt"] = time.time()
        return result
