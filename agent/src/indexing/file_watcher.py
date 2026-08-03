import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Optional


class EditIndexStore:
    def __init__(self, agent_home: Path):
        self.agent_home = agent_home
        self.agent_home.mkdir(parents=True, exist_ok=True)
        self.db_path = self.agent_home / "edits_index.db"
        self.watched_folders_path = self.agent_home / "watched_folders.json"
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS edits (path TEXT NOT NULL, modified_at REAL NOT NULL)"
            )

    def load_watched_folders(self) -> list[str]:
        if not self.watched_folders_path.exists():
            return []
        try:
            data = json.loads(self.watched_folders_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return [str(item) for item in data]
        except Exception:
            return []
        return []

    def save_watched_folders(self, folders: list[str]) -> None:
        self.watched_folders_path.write_text(json.dumps(folders), encoding="utf-8")

    def record_edit(self, path: str, modified_at: Optional[float] = None) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO edits(path, modified_at) VALUES (?, ?)",
                (path, modified_at if modified_at is not None else time.time()),
            )
            conn.commit()
