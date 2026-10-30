import json
from pathlib import Path

RETENTION_OPTIONS = (24, 48, 72)
DEFAULT_RETENTION_HOURS = 72


class BauSettings:
    """Preferências do Baú persistidas em `bau_settings.json` na pasta do agente."""

    def __init__(self, agent_home: Path):
        self.path = agent_home / "bau_settings.json"

    def _load(self) -> dict:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    @property
    def retention_hours(self) -> int:
        value = self._load().get("retentionHours")
        return value if value in RETENTION_OPTIONS else DEFAULT_RETENTION_HOURS

    def set_retention_hours(self, hours: int) -> int:
        if hours not in RETENTION_OPTIONS:
            raise ValueError(f"Retenção deve ser uma destas opções: {RETENTION_OPTIONS}")
        data = self._load()
        data["retentionHours"] = hours
        self.path.write_text(json.dumps(data), encoding="utf-8")
        return hours

    def to_dict(self) -> dict:
        return {"retentionHours": self.retention_hours, "retentionOptions": list(RETENTION_OPTIONS)}
