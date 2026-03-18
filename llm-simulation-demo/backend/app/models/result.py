from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel

from app.models.tool_call import ToolCallRecord


class OutputEnvelope(BaseModel):
    summary: str
    severity: str  # low | medium | high | critical
    recommended_action: str


class TimingInfo(BaseModel):
    provider_ms: int
    total_ms: int


class RunResult(BaseModel):
    request_id: str
    provider: str
    model: str
    output: OutputEnvelope
    tool_calls: List[ToolCallRecord] = []
    timing: TimingInfo
    error: Optional[str] = None
