from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class TicketInput(BaseModel):
    ticket_id: str
    customer_tier: str
    transcript: str


class RunRequest(BaseModel):
    provider: str = Field(default="openai")
    model: Optional[str] = None
    input: TicketInput
