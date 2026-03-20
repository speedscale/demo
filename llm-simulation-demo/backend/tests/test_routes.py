"""Integration tests for all FastAPI routes.

Provider adapters and _call_tool are patched so no real network calls are made.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.main import app
from app.models.result import OutputEnvelope
from app.models.tool_call import ToolCallRecord
from tests.conftest import make_mock_adapter

_GOOD_OUTPUT = OutputEnvelope(
    summary="Checkout fails after tax recalculation.",
    severity="high",
    recommended_action="Rollback tax rule.",
)

_MOCK_TOOL = ToolCallRecord(name="lookup_order", status="ok", duration_ms=10,
                             result={"order_id": "INC-TEST"})


@pytest.fixture
async def client():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


def _patched_adapters():
    return {
        "openai":    make_mock_adapter("openai",    output=_GOOD_OUTPUT),
        "anthropic": make_mock_adapter("anthropic", output=_GOOD_OUTPUT),
        "gemini":    make_mock_adapter("gemini",    output=_GOOD_OUTPUT),
        "xai":       make_mock_adapter("xai",       output=_GOOD_OUTPUT),
    }


# ---------------------------------------------------------------------------
# /healthz
# ---------------------------------------------------------------------------

class TestHealthz:
    async def test_returns_ok(self, client):
        r = await client.get("/healthz")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# /api/providers
# ---------------------------------------------------------------------------

class TestProviders:
    async def test_returns_four_providers(self, client):
        r = await client.get("/api/providers")
        assert r.status_code == 200
        data = r.json()
        assert "providers" in data
        assert "default_provider" in data
        ids = {p["id"] for p in data["providers"]}
        assert ids == {"openai", "anthropic", "gemini", "xai"}

    async def test_each_provider_has_required_keys(self, client):
        r = await client.get("/api/providers")
        for p in r.json()["providers"]:
            assert "id" in p
            assert "models" in p
            assert "default_model" in p
            assert "configured" in p

    async def test_configured_false_without_env_keys(self, client, monkeypatch):
        for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY"):
            monkeypatch.delenv(key, raising=False)
        r = await client.get("/api/providers")
        for p in r.json()["providers"]:
            assert p["configured"] is False


# ---------------------------------------------------------------------------
# POST /api/run
# ---------------------------------------------------------------------------

class TestRunTask:
    async def test_happy_path_shape(self, client):
        with patch("app.main._ADAPTERS", _patched_adapters()), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_MOCK_TOOL)):
            r = await client.post("/api/run", json={
                "provider": "openai",
                "input": {
                    "ticket_id": "INC-001",
                    "customer_tier": "enterprise",
                    "transcript": "Cannot checkout",
                },
            })
        assert r.status_code == 200
        body = r.json()
        assert body["provider"] == "openai"
        assert body["output"]["severity"] == "high"
        assert len(body["tool_calls"]) >= 1
        assert "provider_ms" in body["timing"]
        assert "total_ms" in body["timing"]
        assert "simulation" not in body
        assert "fallback_triggered" not in body

    async def test_model_defaulted_from_adapter(self, client):
        with patch("app.main._ADAPTERS", _patched_adapters()), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_MOCK_TOOL)):
            r = await client.post("/api/run", json={
                "provider": "openai",
                "input": {"ticket_id": "INC-002", "customer_tier": "standard",
                          "transcript": "Test"},
            })
        assert r.json()["model"] == "openai-default"

    async def test_explicit_model_used(self, client):
        with patch("app.main._ADAPTERS", _patched_adapters()), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_MOCK_TOOL)):
            r = await client.post("/api/run", json={
                "provider": "openai",
                "model": "gpt-5.4",
                "input": {"ticket_id": "INC-003", "customer_tier": "vip",
                          "transcript": "Test"},
            })
        assert r.json()["model"] == "gpt-5.4"

    async def test_unknown_provider_returns_400(self, client):
        r = await client.post("/api/run", json={
            "provider": "nonexistent-llm",
            "input": {
                "ticket_id": "INC-002",
                "customer_tier": "standard",
                "transcript": "Test",
            },
        })
        assert r.status_code == 400

    async def test_missing_input_returns_422(self, client):
        r = await client.post("/api/run", json={"provider": "openai"})
        assert r.status_code == 422

    async def test_run_is_stored_and_retrievable(self, client):
        with patch("app.main._ADAPTERS", _patched_adapters()), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_MOCK_TOOL)):
            r = await client.post("/api/run", json={
                "provider": "openai",
                "input": {"ticket_id": "INC-003", "customer_tier": "vip",
                          "transcript": "Test"},
            })
        run_id = r.json()["request_id"]

        r2 = await client.get(f"/api/runs/{run_id}")
        assert r2.status_code == 200
        assert r2.json()["request_id"] == run_id

    async def test_request_id_has_expected_prefix(self, client):
        with patch("app.main._ADAPTERS", _patched_adapters()), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_MOCK_TOOL)):
            r = await client.post("/api/run", json={
                "provider": "anthropic",
                "input": {"ticket_id": "INC-004", "customer_tier": "standard",
                          "transcript": "Test"},
            })
        assert r.json()["request_id"].startswith("req_")

    async def test_provider_error_returns_degraded_output(self, client):
        from app.providers.base import ProviderError
        adapters = {
            "openai": make_mock_adapter("openai", raises=ProviderError("boom", 500)),
            "anthropic": make_mock_adapter("anthropic"),
            "gemini": make_mock_adapter("gemini"),
        }
        with patch("app.main._ADAPTERS", adapters), \
             patch("app.main._call_tool", new=AsyncMock(return_value=_MOCK_TOOL)):
            r = await client.post("/api/run", json={
                "provider": "openai",
                "input": {"ticket_id": "INC-005", "customer_tier": "standard",
                          "transcript": "Test"},
            })
        assert r.status_code == 200
        body = r.json()
        assert body["error"] is not None
        assert body["output"] is not None


# ---------------------------------------------------------------------------
# GET /api/runs
# ---------------------------------------------------------------------------

class TestListRuns:
    async def test_returns_runs_and_total(self, client):
        r = await client.get("/api/runs")
        assert r.status_code == 200
        body = r.json()
        assert "runs" in body
        assert "total" in body
        assert isinstance(body["runs"], list)

    async def test_limit_param_respected(self, client):
        for i in range(5):
            with patch("app.main._ADAPTERS", _patched_adapters()), \
                 patch("app.main._call_tool", new=AsyncMock(return_value=_MOCK_TOOL)):
                await client.post("/api/run", json={
                    "provider": "openai",
                    "input": {"ticket_id": f"INC-L{i:02d}", "customer_tier": "standard",
                              "transcript": f"Test {i}"},
                })
        r = await client.get("/api/runs?limit=2")
        assert len(r.json()["runs"]) <= 2


# ---------------------------------------------------------------------------
# GET /api/runs/{run_id}
# ---------------------------------------------------------------------------

class TestGetRun:
    async def test_unknown_run_returns_404(self, client):
        r = await client.get("/api/runs/req_doesnotexist")
        assert r.status_code == 404
