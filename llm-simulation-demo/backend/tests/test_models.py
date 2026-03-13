"""Tests for Pydantic request/response models."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.request import RunRequest, SimulationConfig, TicketInput
from app.models.result import OutputEnvelope, RunResult, SimulationEcho, TimingInfo
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
# SimulationConfig
# ---------------------------------------------------------------------------

class TestSimulationConfig:
    def test_defaults(self):
        s = SimulationConfig()
        assert s.mode == "live"
        assert s.inject_latency_ms == 0
        assert s.inject_status is None
        assert s.inject_malformed_tool_json is False
        assert s.fallback_provider is None

    def test_override_all(self):
        s = SimulationConfig(
            mode="chaos",
            inject_latency_ms=2000,
            inject_status=429,
            inject_malformed_tool_json=True,
            fallback_provider="openai",
        )
        assert s.inject_latency_ms == 2000
        assert s.inject_status == 429
        assert s.inject_malformed_tool_json is True

    def test_negative_latency_rejected(self):
        with pytest.raises(ValidationError):
            SimulationConfig(inject_latency_ms=-1)


# ---------------------------------------------------------------------------
# RunRequest
# ---------------------------------------------------------------------------

class TestRunRequest:
    def test_minimal(self):
        req = RunRequest(
            input={"ticket_id": "INC-1", "customer_tier": "standard",
                   "transcript": "Test issue"},
        )
        assert req.task == "summarize_ticket"
        assert req.provider == "openai"
        assert req.model is None

    def test_full(self):
        req = RunRequest(
            task="summarize_ticket",
            provider="anthropic",
            model="claude-3-5-haiku-20241022",
            input={"ticket_id": "INC-2", "customer_tier": "vip",
                   "transcript": "Urgent issue"},
            simulation={"mode": "chaos", "inject_status": 429,
                        "fallback_provider": "openai"},
        )
        assert req.provider == "anthropic"
        assert req.simulation.inject_status == 429
        assert req.simulation.fallback_provider == "openai"

    def test_missing_input_raises(self):
        with pytest.raises(ValidationError):
            RunRequest(task="summarize_ticket", provider="openai")


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
            provider_requested="openai",
            provider_used="openai",
            output=OutputEnvelope(summary="s", severity="low",
                                  recommended_action="none"),
            tool_calls=[
                ToolCallRecord(name="lookup_order", status="ok", duration_ms=50)
            ],
            timing=TimingInfo(provider_ms=100, total_ms=150),
            simulation=SimulationEcho(),
        )
        dumped = result.model_dump()
        assert dumped["request_id"] == "req_abc123"
        assert dumped["fallback_triggered"] is False
        assert dumped["tool_calls"][0]["name"] == "lookup_order"

    def test_simulation_echo_defaults(self):
        echo = SimulationEcho()
        assert echo.inject_latency_ms == 0
        assert echo.inject_status is None
        assert echo.inject_malformed_tool_json is False
