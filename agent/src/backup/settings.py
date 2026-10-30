import json
import re
from pathlib import Path

DEFAULT_TIME = "16:30"
TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class BackupSettings:
    """Agenda do backup automático, persistida em `backup_settings.json` na pasta do agente."""

    def __init__(self, agent_home: Path):
        self.path = agent_home / "backup_settings.json"

    def _load(self) -> dict:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    @property
    def enabled(self) -> bool:
        value = self._load().get("enabled")
        return value if isinstance(value, bool) else True

    @property
    def time(self) -> str:
        value = self._load().get("time")
        return value if isinstance(value, str) and TIME_PATTERN.match(value) else DEFAULT_TIME

    @property
    def hour_minute(self) -> tuple[int, int]:
        hour, minute = self.time.split(":")
        return int(hour), int(minute)

    def update(self, enabled: bool | None = None, time: str | None = None) -> None:
        data = self._load()
        if enabled is not None:
            data["enabled"] = bool(enabled)
        if time is not None:
            if not TIME_PATTERN.match(time):
                raise ValueError("Horário deve estar no formato HH:MM")
            data["time"] = time
        self.path.write_text(json.dumps(data), encoding="utf-8")

    def to_dict(self) -> dict:
        return {"enabled": self.enabled, "time": self.time}
