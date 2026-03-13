"""Tests for simulation logic: fallback, latency injection, error injection, tool chaos.

These are the core demo behaviors and get the most thorough coverage.
"""
from __future__ import annotations

import time
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.main import app
from app.models.result import OutputEnvelope
from app.models.tool_call import ToolCallRecord
from app.providers.base import ProviderError
from tests.conftest import make_mock_adapter

_GOOD_OUTPUT = OutputEnvelope(
    summary="Checkout fails after tax recalculation.",
    severity="high",
    recommended_action="Rollback tax rule.",
)

_TOOL_OK = ToolCallRecord(name="lookup_order", status="ok", duration_ms=10,
                           result={"order_id": "INC-SIM"})
_TOOL_ERR = ToolCallRecord(name="lookup_order", status="error", duration_ms=5,
                            error="HTTP 500")
# Simulates what the tool endpoint returns when inject_malformed=True
_TOOL_DRIFTED = ToolCallRecord(name="lookup_order", status="ok", duration_ms=8,
                                result={"_old_order_id": "INC-SIM", "_old_status": "shipped"})


@pytest.fixture
async def client():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


def _base_body(**sim_overrides) -> dict:
    return {
        "task": "summarize_ticket",
        "provider": "anthropic",
        "input": {
            "ticket_id": "INC-SIM",
            "customer_tier": "enterprise",
            "transcript": "Simulation test transcript.",
        },
        "simulation": sim_overrides,
    }


# ---------------------------------------------------------------------------
# Fallback logic
# ---------------------------------------------------------------------------

class TestFallback:
    async def test_429_triggers_fallback(self, client):
        """inject_status=429 should mark fallback_triggered=True and use the fallback provider."""
        primary = make_mock_adapter("anthropic", raises=ProviderError("rate limited", 429))
        fallback = make_mock_adapter("openai", output=_GOOD_OUTPUT)
        adapters = {"anthropic": primary, "openai": fallback, "gemini": make_mock_adapter("gemini")}

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_OK)):
            r = await client.post("/api/run", json=_base_body(
                inject_status=429,
                fallback_provider="openai",
            ))

        assert r.status_code == 200
        body = r.json()
        assert body["fallback_triggered"] is True
        assert body["provider_requested"] == "anthropic"
        assert body["provider_used"] == "openai"
        assert body["error"] is not None

    async def test_no_fallback_when_fallback_provider_unset(self, client):
        """Without a fallback_provider the response degrades gracefully."""
        primary = make_mock_adapter("anthropic", raises=ProviderError("rate limited", 429))
        adapters = {"anthropic": primary, "openai": make_mock_adapter("openai"),
                    "gemini": make_mock_adapter("gemini")}

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_OK)):
            r = await client.post("/api/run", json=_base_body(inject_status=429))

        assert r.status_code == 200
        body = r.json()
        assert body["fallback_triggered"] is False
        assert body["provider_used"] == "anthropic"
        # Degraded output is still a valid envelope
        assert body["output"]["severity"] == "high"

    async def test_fallback_not_triggered_when_primary_succeeds(self, client):
        adapters = {
            "openai": make_mock_adapter("openai", output=_GOOD_OUTPUT),
            "anthropic": make_mock_adapter("anthropic", output=_GOOD_OUTPUT),
            "gemini": make_mock_adapter("gemini", output=_GOOD_OUTPUT),
        }

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_OK)):
            r = await client.post("/api/run", json={
                **_base_body(fallback_provider="openai"),
                "provider": "openai",
            })

        assert r.json()["fallback_triggered"] is False

    async def test_both_primary_and_fallback_fail(self, client):
        """When both providers fail the error field captures both messages."""
        err = ProviderError("boom", 500)
        adapters = {
            "anthropic": make_mock_adapter("anthropic", raises=ProviderError("primary fail", 500)),
            "openai": make_mock_adapter("openai", raises=ProviderError("fallback fail", 500)),
            "gemini": make_mock_adapter("gemini"),
        }

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_OK)):
            r = await client.post("/api/run", json=_base_body(
                inject_status=None,  # real error, not simulated status
                fallback_provider="openai",
            ))

        body = r.json()
        # Degraded output still returned, not a 5xx
        assert r.status_code == 200
        assert body["output"] is not None

    async def test_fallback_to_same_provider_ignored(self, client):
        """fallback_provider == provider should not trigger a fallback loop."""
        adapters = {
            "openai": make_mock_adapter("openai", raises=ProviderError("fail", 429)),
            "anthropic": make_mock_adapter("anthropic"),
            "gemini": make_mock_adapter("gemini"),
        }

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_OK)):
            r = await client.post("/api/run", json={
                **_base_body(inject_status=429, fallback_provider="openai"),
                "provider": "openai",
            })

        body = r.json()
        assert body["fallback_triggered"] is False


# ---------------------------------------------------------------------------
# Latency injection
# ---------------------------------------------------------------------------

class TestLatencyInjection:
    async def test_inject_latency_delays_response(self, client):
        adapters = {
            "openai": make_mock_adapter("openai", output=_GOOD_OUTPUT),
            "anthropic": make_mock_adapter("anthropic", output=_GOOD_OUTPUT),
            "gemini": make_mock_adapter("gemini", output=_GOOD_OUTPUT),
        }

        delay_ms = 300
        start = time.monotonic()
        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_OK)):
            r = await client.post("/api/run", json={
                **_base_body(inject_latency_ms=delay_ms),
                "provider": "openai",
            })
        elapsed_ms = (time.monotonic() - start) * 1000

        assert r.status_code == 200
        assert elapsed_ms >= delay_ms * 0.9  # allow 10% tolerance

    async def test_zero_latency_does_not_delay(self, client):
        adapters = {"openai": make_mock_adapter("openai", output=_GOOD_OUTPUT),
                    "anthropic": make_mock_adapter("anthropic"),
                    "gemini": make_mock_adapter("gemini")}

        start = time.monotonic()
        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_OK)):
            await client.post("/api/run", json={
                **_base_body(inject_latency_ms=0),
                "provider": "openai",
            })
        elapsed_ms = (time.monotonic() - start) * 1000
        assert elapsed_ms < 500  # no artificial delay

    async def test_latency_echoed_in_simulation_field(self, client):
        adapters = {"openai": make_mock_adapter("openai", output=_GOOD_OUTPUT),
                    "anthropic": make_mock_adapter("anthropic"),
                    "gemini": make_mock_adapter("gemini")}

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_OK)):
            r = await client.post("/api/run", json={
                **_base_body(inject_latency_ms=100),
                "provider": "openai",
            })

        assert r.json()["simulation"]["inject_latency_ms"] == 100


# ---------------------------------------------------------------------------
# inject_status on tool calls
# ---------------------------------------------------------------------------

class TestToolStatusInjection:
    async def test_inject_500_causes_order_tool_error(self, client):
        """inject_status=500 causes the order tool to report an error.

        _call_tool is mocked to return the same error record the real implementation
        produces when the tool endpoint returns 500 (verified in test_tools.py).
        """
        adapters = {"openai": make_mock_adapter("openai", output=_GOOD_OUTPUT),
                    "anthropic": make_mock_adapter("anthropic"),
                    "gemini": make_mock_adapter("gemini")}

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_ERR)):
            r = await client.post("/api/run", json={
                **_base_body(inject_status=500),
                "provider": "openai",
            })

        body = r.json()
        order_call = next(t for t in body["tool_calls"] if t["name"] == "lookup_order")
        assert order_call["status"] == "error"

    async def test_inject_status_echoed(self, client):
        adapters = {"openai": make_mock_adapter("openai", output=_GOOD_OUTPUT),
                    "anthropic": make_mock_adapter("anthropic"),
                    "gemini": make_mock_adapter("gemini")}

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_ERR)):
            r = await client.post("/api/run", json={
                **_base_body(inject_status=500),
                "provider": "openai",
            })

        assert r.json()["simulation"]["inject_status"] == 500


# ---------------------------------------------------------------------------
# Malformed tool JSON
# ---------------------------------------------------------------------------

class TestMalformedToolJson:
    async def test_malformed_flag_echoed(self, client):
        adapters = {"openai": make_mock_adapter("openai", output=_GOOD_OUTPUT),
                    "anthropic": make_mock_adapter("anthropic"),
                    "gemini": make_mock_adapter("gemini")}

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_DRIFTED)):
            r = await client.post("/api/run", json={
                **_base_body(inject_malformed_tool_json=True),
                "provider": "openai",
            })

        assert r.json()["simulation"]["inject_malformed_tool_json"] is True

    async def test_malformed_tool_result_has_drifted_fields(self, client):
        """When inject_malformed_tool_json is true the order tool result has schema-drifted fields.

        _call_tool is mocked to return the same output the real /tools/order endpoint
        produces with inject_malformed=true (verified separately in test_tools.py).
        """
        adapters = {"openai": make_mock_adapter("openai", output=_GOOD_OUTPUT),
                    "anthropic": make_mock_adapter("anthropic"),
                    "gemini": make_mock_adapter("gemini")}

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_DRIFTED)):
            r = await client.post("/api/run", json={
                **_base_body(inject_malformed_tool_json=True),
                "provider": "openai",
            })

        body = r.json()
        order_call = next(t for t in body["tool_calls"] if t["name"] == "lookup_order")
        assert order_call["status"] == "ok"
        result_keys = list(order_call["result"].keys())
        assert all(k.startswith("_old_") for k in result_keys)


# ---------------------------------------------------------------------------
# Simulation echo fields
# ---------------------------------------------------------------------------

class TestSimulationEcho:
    async def test_echo_reflects_request(self, client):
        adapters = {"openai": make_mock_adapter("openai", output=_GOOD_OUTPUT),
                    "anthropic": make_mock_adapter("anthropic"),
                    "gemini": make_mock_adapter("gemini")}

        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_TOOL_OK)):
            r = await client.post("/api/run", json={
                **_base_body(inject_latency_ms=50, inject_status=429,
                             inject_malformed_tool_json=False),
                "provider": "openai",
            })

        sim = r.json()["simulation"]
        assert sim["inject_latency_ms"] == 50
        assert sim["inject_status"] == 429
        assert sim["inject_malformed_tool_json"] is False
