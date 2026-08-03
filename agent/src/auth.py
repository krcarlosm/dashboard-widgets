import os
import secrets
from pathlib import Path


class LocalAuth:
    def __init__(self, agent_home: Path | None = None):
        self.agent_home = agent_home or Path(os.environ.get("DASHBOARD_AGENT_HOME", Path.home() / ".dashboard-agent"))
        self.agent_home.mkdir(parents=True, exist_ok=True)
        self.token_file = self.agent_home / "auth.token"

    def get_or_create_token(self) -> str:
        if self.token_file.exists():
            return self.token_file.read_text(encoding="utf-8").strip()

        token = secrets.token_hex(16)
        self.token_file.write_text(token, encoding="utf-8")
        return token

    def validate_token(self, token: str | None) -> bool:
        return bool(token) and token == self.get_or_create_token()
