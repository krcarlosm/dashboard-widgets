from typing import Any, Optional
from pydantic import BaseModel, Field


class AgentMessage(BaseModel):
    type: str = Field(..., description="Tipo de evento / mensagem (ex: handshake, ping, clipboard:event)")
    payload: Optional[Any] = Field(default=None, description="Dados associados à mensagem")


class HandshakePayload(BaseModel):
    client: str = "dashboard-ui"
    version: str = "0.1.0"
