"""Tests for Pydantic request/response models."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.request import RunRequest, TicketInput
from app.models.result import LLMStep, OutputEnvelope, RunResult, TimingInfo
from app.models.tool_call import ToolCallRecord


# ---------------------------------------------------------------------------
# TicketInput
# ---------------------------------------------------------------------------

class TestTicketInput:
    def test_valid(self):
        t = TicketInput(ticket_id="INC-1", customer_tier="enterprise",
                        transcript="Cannot login.")
        assert t.ticket_id == "INC-1"
        assert t.customer_tier == "enterprise"

    def test_missing_field_raises(self):
        with pytest.raises(ValidationError):
            TicketInput(ticket_id="INC-1", customer_tier="enterprise")  # missing transcript


# ---------------------------------------------------------------------------
# RunRequest
# ---------------------------------------------------------------------------

class TestRunRequest:
    def test_minimal(self):
        req = RunRequest(
            input={"ticket_id": "INC-1", "customer_tier": "standard",
                   "transcript": "Test issue"},
        )
        assert req.provider == "openai"
        assert req.model is None

    def test_with_provider_and_model(self):
        req = RunRequest(
            provider="anthropic",
            model="claude-haiku-4-5",
            input={"ticket_id": "INC-2", "customer_tier": "vip",
                   "transcript": "Urgent issue"},
        )
        assert req.provider == "anthropic"
        assert req.model == "claude-haiku-4-5"

    def test_missing_input_raises(self):
        with pytest.raises(ValidationError):
            RunRequest(provider="openai")


# ---------------------------------------------------------------------------
# OutputEnvelope
# ---------------------------------------------------------------------------

class TestOutputEnvelope:
    def test_valid(self):
        o = OutputEnvelope(
            summary="Issue found.",
            severity="high",
            recommended_action="Escalate immediately.",
        )
        assert o.severity == "high"

    def test_missing_field_raises(self):
        with pytest.raises(ValidationError):
            OutputEnvelope(summary="x", severity="high")  # missing recommended_action


# ---------------------------------------------------------------------------
# ToolCallRecord
# ---------------------------------------------------------------------------

class TestToolCallRecord:
    def test_ok_record(self):
        r = ToolCallRecord(name="lookup_order", status="ok", duration_ms=100,
                           result={"order_id": "INC-1"})
        assert r.status == "ok"
        assert r.error is None

    def test_error_record(self):
        r = ToolCallRecord(name="lookup_order", status="error", duration_ms=5,
                           error="HTTP 500")
        assert r.status == "error"
        assert r.result is None


# ---------------------------------------------------------------------------
# RunResult round-trip serialization
# ---------------------------------------------------------------------------

class TestRunResultSerialization:
    def test_json_round_trip(self):
        result = RunResult(
            request_id="req_abc123",
            provider="openai",
            model="gpt-4o-mini",
            output=OutputEnvelope(summary="s", severity="low",
                                  recommended_action="none"),
            steps=[
                LLMStep(name="triage", prompt_tokens=100, completion_tokens=50,
                        cost_usd=0.00006, duration_ms=300),
            ],
            tool_calls=[
                ToolCallRecord(name="lookup_order", status="ok", duration_ms=50)
            ],
            timing=TimingInfo(provider_ms=100, total_ms=150),
            total_tokens=150,
            cost_usd=0.00006,
        )
        dumped = result.model_dump()
        assert dumped["request_id"] == "req_abc123"
        assert dumped["provider"] == "openai"
        assert dumped["model"] == "gpt-4o-mini"
        assert dumped["tool_calls"][0]["name"] == "lookup_order"
        assert dumped["error"] is None
        assert dumped["total_tokens"] == 150
        assert dumped["cost_usd"] == 0.00006
        assert len(dumped["steps"]) == 1
        assert dumped["steps"][0]["name"] == "triage"
