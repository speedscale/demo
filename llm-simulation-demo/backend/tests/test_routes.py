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
        "openai": make_mock_adapter("openai", output=_GOOD_OUTPUT),
        "anthropic": make_mock_adapter("anthropic", output=_GOOD_OUTPUT),
        "gemini": make_mock_adapter("gemini", output=_GOOD_OUTPUT),
    }


def _mock_call_tool(*args, **kwargs):
    return AsyncMock(return_value=_MOCK_TOOL)()


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
    async def test_returns_three_providers(self, client):
        r = await client.get("/api/providers")
        assert r.status_code == 200
        data = r.json()
        assert "providers" in data
        assert "default_provider" in data
        ids = {p["id"] for p in data["providers"]}
        assert ids == {"openai", "anthropic", "gemini"}

    async def test_each_provider_has_required_keys(self, client):
        r = await client.get("/api/providers")
        for p in r.json()["providers"]:
            assert "id" in p
            assert "models" in p
            assert "default_model" in p
            assert "configured" in p

    async def test_configured_false_without_env_keys(self, client, monkeypatch):
        for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"):
            monkeypatch.delenv(key, raising=False)
        r = await client.get("/api/providers")
        for p in r.json()["providers"]:
            assert p["configured"] is False


# ---------------------------------------------------------------------------
# /api/scenarios
# ---------------------------------------------------------------------------

class TestScenarios:
    async def test_returns_five_scenarios(self, client):
        r = await client.get("/api/scenarios")
        assert r.status_code == 200
        scenarios = r.json()["scenarios"]
        assert len(scenarios) == 5

    async def test_each_scenario_has_required_keys(self, client):
        r = await client.get("/api/scenarios")
        for s in r.json()["scenarios"]:
            assert "id" in s
            assert "name" in s
            assert "description" in s

    async def test_known_scenario_ids_present(self, client):
        r = await client.get("/api/scenarios")
        ids = {s["id"] for s in r.json()["scenarios"]}
        assert "baseline-ticket" in ids
        assert "fallback-to-openai" in ids
        assert "tool-failure" in ids


# ---------------------------------------------------------------------------
# POST /api/scenarios/{id}/run
# ---------------------------------------------------------------------------

class TestRunScenario:
    async def test_known_scenario_returns_run_result(self, client):
        with patch("app.main._ADAPTERS", _patched_adapters()), \
             patch("app.main._call_tool", side_effect=lambda *a, **kw: AsyncMock(return_value=_MOCK_TOOL)()):
            r = await client.post("/api/scenarios/baseline-ticket/run")
        assert r.status_code == 200
        body = r.json()
        assert "request_id" in body
        assert body["provider_requested"] == "openai"

    async def test_unknown_scenario_returns_404(self, client):
        r = await client.post("/api/scenarios/does-not-exist/run")
        assert r.status_code == 404

    async def test_all_five_scenarios_run(self, client):
        scenario_ids = [
            "baseline-ticket",
            "provider-timeout",
            "malformed-tool-response",
            "fallback-to-openai",
            "tool-failure",
        ]
        for sid in scenario_ids:
            with patch("app.main._ADAPTERS", _patched_adapters()), \
                 patch("app.main._call_tool", side_effect=lambda *a, **kw: AsyncMock(return_value=_MOCK_TOOL)()):
                r = await client.post(f"/api/scenarios/{sid}/run")
            assert r.status_code == 200, f"Scenario {sid!r} failed with {r.status_code}"


# ---------------------------------------------------------------------------
# POST /api/run
# ---------------------------------------------------------------------------

class TestRunTask:
    async def test_happy_path_shape(self, client):
        with patch("app.main._ADAPTERS", _patched_adapters()), \
             patch("app.main._call_tool", side_effect=lambda *a, **kw: AsyncMock(return_value=_MOCK_TOOL)()):
            r = await client.post("/api/run", json={
                "task": "summarize_ticket",
                "provider": "openai",
                "input": {
                    "ticket_id": "INC-001",
                    "customer_tier": "enterprise",
                    "transcript": "Cannot checkout",
                },
            })
        assert r.status_code == 200
        body = r.json()
        assert body["provider_requested"] == "openai"
        assert body["provider_used"] == "openai"
        assert body["fallback_triggered"] is False
        assert body["output"]["severity"] == "high"
        assert len(body["tool_calls"]) >= 1
        assert "provider_ms" in body["timing"]
        assert "total_ms" in body["timing"]

    async def test_unknown_provider_returns_400(self, client):
        r = await client.post("/api/run", json={
            "task": "summarize_ticket",
            "provider": "nonexistent-llm",
            "input": {
                "ticket_id": "INC-002",
                "customer_tier": "standard",
                "transcript": "Test",
            },
        })
        assert r.status_code == 400

    async def test_missing_input_returns_422(self, client):
        r = await client.post("/api/run", json={
            "task": "summarize_ticket",
            "provider": "openai",
        })
        assert r.status_code == 422

    async def test_run_is_stored_and_retrievable(self, client):
        with patch("app.main._ADAPTERS", _patched_adapters()), \
             patch("app.main._call_tool", side_effect=lambda *a, **kw: AsyncMock(return_value=_MOCK_TOOL)()):
            r = await client.post("/api/run", json={
                "task": "summarize_ticket",
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
             patch("app.main._call_tool", side_effect=lambda *a, **kw: AsyncMock(return_value=_MOCK_TOOL)()):
            r = await client.post("/api/run", json={
                "task": "summarize_ticket",
                "provider": "anthropic",
                "input": {"ticket_id": "INC-004", "customer_tier": "standard",
                          "transcript": "Test"},
            })
        assert r.json()["request_id"].startswith("req_")


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
        # Populate a few runs first
        for i in range(5):
            with patch("app.main._ADAPTERS", _patched_adapters()), \
                 patch("app.main._call_tool", side_effect=lambda *a, **kw: AsyncMock(return_value=_MOCK_TOOL)()):
                await client.post("/api/run", json={
                    "task": "summarize_ticket",
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
