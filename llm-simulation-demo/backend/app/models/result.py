from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel

from app.models.tool_call import ToolCallRecord


class LLMStep(BaseModel):
    name: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    duration_ms: int


class OutputEnvelope(BaseModel):
    summary: str
    severity: str  # low | medium | high | critical
    recommended_action: str
    root_cause: Optional[str] = None
    response_draft: Optional[str] = None


class TimingInfo(BaseModel):
    provider_ms: int
    total_ms: int


class RunResult(BaseModel):
    request_id: str
    provider: str
    model: str
    output: OutputEnvelope
    steps: List[LLMStep] = []
    tool_calls: List[ToolCallRecord] = []
    timing: TimingInfo
    total_tokens: int = 0
    cost_usd: float = 0.0
    error: Optional[str] = None
