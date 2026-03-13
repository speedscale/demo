from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class SimulationConfig(BaseModel):
    mode: str = Field(default="live", description="live | mock | chaos")
    inject_latency_ms: int = Field(default=0, ge=0)
    inject_status: Optional[int] = Field(default=None)
    inject_malformed_tool_json: bool = False
    fallback_provider: Optional[str] = None


class TicketInput(BaseModel):
    ticket_id: str
    customer_tier: str
    transcript: str


class RunRequest(BaseModel):
    task: str = Field(default="summarize_ticket")
    provider: str = Field(default="openai")
    model: Optional[str] = None
    input: TicketInput
    simulation: SimulationConfig = Field(default_factory=SimulationConfig)
