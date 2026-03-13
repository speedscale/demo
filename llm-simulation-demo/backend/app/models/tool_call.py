from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel


class ToolCallRecord(BaseModel):
    name: str
    status: str  # ok | error | timeout
    duration_ms: int
    result: Optional[Any] = None
    error: Optional[str] = None
