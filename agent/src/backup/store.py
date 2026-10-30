import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

KEEP_AUTO_BACKUPS = 10
TIMESTAMP_FORMAT = "%Y-%m-%d_%H-%M-%S"

# auto-dashboard-backup-2026-10-30_16-30-00.json, manual-… ou o formato antigo sem prefixo.
BACKUP_NAME_PATTERN = re.compile(
    r"^(?:(auto|manual)-)?dashboard-backup-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})(?:-(\d+))?\.json$"
)


def _linux_documents_dir() -> Optional[Path]:
    try:
        result = subprocess.run(["xdg-user-dir", "DOCUMENTS"], capture_output=True, text=True, timeout=3)
        value = result.stdout.strip()
        # xdg-user-dir devolve a própria home quando a pasta não está configurada.
        if result.returncode == 0 and value and Path(value) != Path.home():
            return Path(value)
    except Exception:
        pass

    config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "user-dirs.dirs"
    try:
        for line in config.read_text(encoding="utf-8").splitlines():
            if line.startswith("XDG_DOCUMENTS_DIR="):
                value = line.split("=", 1)[1].strip().strip('"').replace("$HOME", str(Path.home()))
                if value and Path(value) != Path.home():
                    return Path(value)
    except Exception:
        pass
    return None


def resolve_backup_dir() -> Path:
    override = os.environ.get("DASHBOARD_BACKUP_DIR")
    if override:
        return Path(override)
    if sys.platform.startswith("linux"):
        documents = _linux_documents_dir()
        return (documents / "Dashboard Backups") if documents else (Path.home() / "Dashboard Backups")
    return Path.home() / "Documents" / "Dashboard Backups"


@dataclass
class BackupFile:
    name: str
    kind: str  # "auto" | "manual" (arquivos antigos sem prefixo contam como manuais)
    createdAt: str
    size: int

    def to_dict(self) -> dict:
        return asdict(self)


class BackupStore:
    """Arquivos de backup do dashboard: gravação, listagem, leitura e rodízio dos automáticos."""

    def __init__(self, directory: Path):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _parse(name: str) -> Optional[tuple[str, datetime]]:
        match = BACKUP_NAME_PATTERN.match(name)
        if not match:
            return None
        try:
            created = datetime.strptime(match.group(2), TIMESTAMP_FORMAT)
        except ValueError:
            return None
        return (match.group(1) or "manual", created)

    def _entries(self) -> list[tuple[Path, str, datetime]]:
        entries = []
        for path in self.directory.glob("*.json"):
            parsed = self._parse(path.name)
            if parsed and path.is_file():
                entries.append((path, parsed[0], parsed[1]))
        # Mais recente primeiro; o nome desempata backups do mesmo segundo.
        entries.sort(key=lambda entry: (entry[2], entry[0].name), reverse=True)
        return entries

    def list_backups(self) -> list[dict]:
        result = []
        for path, kind, created in self._entries():
            try:
                size = path.stat().st_size
            except OSError:
                continue
            result.append(BackupFile(path.name, kind, created.isoformat(timespec="seconds"), size).to_dict())
        return result

    def last_backup_at(self, kind: str) -> Optional[datetime]:
        for _path, entry_kind, created in self._entries():
            if entry_kind == kind:
                return created
        return None

    def path_for(self, name: str) -> Optional[Path]:
        if not self._parse(name):
            return None
        path = self.directory / name
        return path if path.is_file() else None

    def read(self, name: str) -> Optional[dict]:
        path = self.path_for(name)
        if path is None:
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def save(self, payload: dict, kind: str, now: Optional[datetime] = None) -> Path:
        if kind not in ("auto", "manual"):
            raise ValueError("Tipo de backup inválido")
        stamp = (now or datetime.now()).strftime(TIMESTAMP_FORMAT)
        base = f"{kind}-dashboard-backup-{stamp}"
        path = self.directory / f"{base}.json"
        suffix = 2
        while path.exists():
            path = self.directory / f"{base}-{suffix}.json"
            suffix += 1

        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)

        if kind == "auto":
            self.rotate_auto()
        return path

    def rotate_auto(self, keep: int = KEEP_AUTO_BACKUPS) -> list[str]:
        """Mantém só os `keep` backups automáticos mais recentes; manuais nunca são apagados."""
        removed = []
        autos = [entry for entry in self._entries() if entry[1] == "auto"]
        for path, _kind, _created in autos[keep:]:
            try:
                path.unlink()
                removed.append(path.name)
            except OSError:
                pass
        return removed


def last_slot(now: datetime, hour: int, minute: int) -> datetime:
    """Horário agendado mais recente que já passou (hoje ou ontem)."""
    today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return today if now >= today else today - timedelta(days=1)
