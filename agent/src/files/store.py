import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Iterable, Optional

WINDOW_DAYS = 7
RETENTION_DAYS = 30
# Salvamentos automáticos (Word, Excel, editores) geram várias gravações seguidas:
# dentro desta janela contam como uma única edição.
EDIT_GROUP_SECONDS = 5 * 60
OPEN_GROUP_SECONDS = 60


def path_key(path: str) -> str:
    """Chave de comparação: no Windows o sistema de arquivos ignora maiúsculas."""
    return os.path.normcase(os.path.normpath(path))


class ActivityStore:
    """Eventos de acesso a arquivos (aberto/editado) em SQLite, usados pelo Top 10 da semana."""

    def __init__(self, agent_home: Path):
        agent_home.mkdir(parents=True, exist_ok=True)
        self.db_path = agent_home / "file_activity.db"
        self._lock = threading.Lock()
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS access_events (
                    id INTEGER PRIMARY KEY,
                    key TEXT NOT NULL,
                    path TEXT NOT NULL,
                    kind TEXT NOT NULL CHECK (kind IN ('opened', 'edited')),
                    ts REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_events_ts ON access_events(ts);
                CREATE INDEX IF NOT EXISTS idx_events_key ON access_events(key, kind, ts);
                -- Última data de modificação vista de cada arquivo conhecido.
                CREATE TABLE IF NOT EXISTS known_files (key TEXT PRIMARY KEY, mtime REAL NOT NULL);
                -- Último registro já processado de cada fonte de "recentes" do sistema.
                CREATE TABLE IF NOT EXISTS recent_seen (source TEXT PRIMARY KEY, ts REAL NOT NULL);
                """
            )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path, timeout=10)

    def record(self, path: str, kind: str, ts: Optional[float] = None) -> bool:
        """Grava um evento; devolve False quando ele foi agrupado com um anterior."""
        ts = ts if ts is not None else time.time()
        key = path_key(path)
        window = EDIT_GROUP_SECONDS if kind == "edited" else OPEN_GROUP_SECONDS
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT id, ts FROM access_events WHERE key = ? AND kind = ? AND ts BETWEEN ? AND ? ORDER BY ts DESC LIMIT 1",
                (key, kind, ts - window, ts + window),
            ).fetchone()
            if row:
                if ts > row[1]:
                    conn.execute("UPDATE access_events SET ts = ?, path = ? WHERE id = ?", (ts, path, row[0]))
                return False
            conn.execute("INSERT INTO access_events(key, path, kind, ts) VALUES (?, ?, ?, ?)", (key, path, kind, ts))
            return True

    def top(self, days: int = WINDOW_DAYS, limit: int = 30, kind: Optional[str] = None) -> list[dict]:
        since = time.time() - days * 86400
        kind_filter = "AND kind = ?" if kind else ""
        params: list = [since] + ([kind] if kind else []) + [limit]
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT key,
                       (SELECT path FROM access_events latest WHERE latest.key = e.key ORDER BY ts DESC LIMIT 1) AS path,
                       SUM(kind = 'opened') AS opened,
                       SUM(kind = 'edited') AS edited,
                       COUNT(*) AS total,
                       MAX(CASE WHEN kind = 'opened' THEN ts END) AS last_opened,
                       MAX(CASE WHEN kind = 'edited' THEN ts END) AS last_edited,
                       MAX(ts) AS last_access
                FROM access_events e
                WHERE ts >= ? {kind_filter}
                GROUP BY key
                ORDER BY total DESC, last_access DESC
                LIMIT ?
                """,
                params,
            ).fetchall()
        to_ms = lambda value: int(value * 1000) if value else None
        return [
            {
                "path": row[1],
                "name": os.path.basename(row[1]),
                "folder": os.path.dirname(row[1]),
                "opened": row[2],
                "edited": row[3],
                "total": row[4],
                "lastOpened": to_ms(row[5]),
                "lastEdited": to_ms(row[6]),
                "lastAccess": to_ms(row[7]),
            }
            for row in rows
        ]

    def is_indexed(self, path: str) -> bool:
        with self._connect() as conn:
            return conn.execute("SELECT 1 FROM access_events WHERE key = ? LIMIT 1", (path_key(path),)).fetchone() is not None

    def recent_paths(self, days: int = WINDOW_DAYS) -> list[str]:
        """Arquivos com atividade na janela: são os que o agente acompanha por mtime."""
        since = time.time() - days * 86400
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT path FROM access_events e WHERE ts >= ? AND ts = (SELECT MAX(ts) FROM access_events x WHERE x.key = e.key)",
                (since,),
            ).fetchall()
        return [row[0] for row in rows]

    def known_mtime(self, path: str) -> Optional[float]:
        with self._connect() as conn:
            row = conn.execute("SELECT mtime FROM known_files WHERE key = ?", (path_key(path),)).fetchone()
        return row[0] if row else None

    def set_known_mtime(self, path: str, mtime: float) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("INSERT OR REPLACE INTO known_files(key, mtime) VALUES (?, ?)", (path_key(path), mtime))

    def seen_sources(self, prefix: str) -> dict[str, float]:
        with self._connect() as conn:
            rows = conn.execute("SELECT source, ts FROM recent_seen WHERE source LIKE ?", (prefix + "%",)).fetchall()
        return {row[0]: row[1] for row in rows}

    def mark_seen(self, entries: Iterable[tuple[str, float]]) -> None:
        with self._lock, self._connect() as conn:
            conn.executemany("INSERT OR REPLACE INTO recent_seen(source, ts) VALUES (?, ?)", list(entries))

    def purge(self, days: int = RETENTION_DAYS) -> int:
        since = time.time() - days * 86400
        with self._lock, self._connect() as conn:
            removed = conn.execute("DELETE FROM access_events WHERE ts < ?", (since,)).rowcount
            conn.execute("DELETE FROM known_files WHERE key NOT IN (SELECT DISTINCT key FROM access_events)")
            return removed
