from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from app.models.tool_call import ToolCallRecord


class OutputEnvelope(BaseModel):
    summary: str
    severity: str  # low | medium | high | critical
    recommended_action: str


class TimingInfo(BaseModel):
    provider_ms: int
    total_ms: int


class SimulationEcho(BaseModel):
    inject_latency_ms: int = 0
    inject_status: Optional[int] = None
    inject_malformed_tool_json: bool = False


class RunResult(BaseModel):
    request_id: str
    provider_requested: str
    provider_used: str
    fallback_triggered: bool = False
    output: OutputEnvelope
    tool_calls: List[ToolCallRecord] = []
    timing: TimingInfo
    simulation: SimulationEcho
    error: Optional[str] = None
