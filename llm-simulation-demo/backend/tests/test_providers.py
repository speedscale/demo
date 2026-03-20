"""Unit tests for provider adapters.

All HTTP calls are mocked so no real network requests are made.
Each adapter now makes 3 sequential LLM calls (triage → analysis → response).
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.models.request import RunRequest
from app.providers.base import (
    AdapterResult,
    ProviderError,
    build_triage_message,
    _safe_json,
    calculate_cost,
)
from app.providers.openai_adapter import OpenAIAdapter
from app.providers.anthropic_adapter import AnthropicAdapter
from app.providers.gemini_adapter import GeminiAdapter


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _make_request() -> RunRequest:
    return RunRequest(
        provider="openai",
        input={
            "ticket_id": "INC-99",
            "customer_tier": "enterprise",
            "transcript": "App crashes on checkout.",
        },
    )


TRIAGE_JSON = json.dumps({
    "severity": "high",
    "category": "technical",
    "urgency_score": 8,
    "escalation_required": True,
    "affected_component": "checkout flow",
    "customer_sentiment": "frustrated",
})

ANALYSIS_JSON = json.dumps({
    "root_cause": "Null pointer in checkout controller.",
    "customer_impact": "All checkout attempts fail.",
    "affected_systems": ["order-service", "payment-service"],
    "estimated_resolution_time": "2 hours",
    "investigation_steps": ["Check logs", "Rollback deploy"],
    "summary": "App crashes on checkout.",
})

RESPONSE_JSON = json.dumps({
    "subject_line": "Re: INC-99 - Checkout Issue",
    "response_body": "We are investigating your checkout issue.",
    "recommended_action": "Rollback last deploy.",
    "follow_up_required": True,
    "internal_notes": "P1 — escalate immediately.",
})


# ---------------------------------------------------------------------------
# base.py helpers
# ---------------------------------------------------------------------------

class TestBuildTriageMessage:
    def test_contains_ticket_fields(self):
        req = _make_request()
        msg = build_triage_message(req)
        assert "INC-99" in msg
        assert "enterprise" in msg
        assert "App crashes on checkout." in msg

    def test_format_labels_present(self):
        req = _make_request()
        msg = build_triage_message(req)
        assert "Ticket ID:" in msg
        assert "Customer Tier:" in msg


class TestSafeJson:
    def test_valid_json_returns_dict(self):
        result = _safe_json('{"key": "value"}', {})
        assert result == {"key": "value"}

    def test_invalid_json_returns_default(self):
        result = _safe_json("not json {{", {"fallback": True})
        assert result == {"fallback": True}

    def test_empty_string_returns_default(self):
        result = _safe_json("", {})
        assert result == {}


class TestCalculateCost:
    def test_known_model(self):
        cost = calculate_cost("gpt-5.4-mini", 1_000_000, 0)
        assert abs(cost - 0.75) < 0.001

    def test_output_tokens_more_expensive(self):
        cost_in = calculate_cost("gpt-5.4-mini", 1000, 0)
        cost_out = calculate_cost("gpt-5.4-mini", 0, 1000)
        assert cost_out > cost_in

    def test_unknown_model_uses_default(self):
        cost = calculate_cost("unknown-model-xyz", 1000, 1000)
        assert cost > 0


# ---------------------------------------------------------------------------
# OpenAIAdapter — 3 sequential HTTP calls
# ---------------------------------------------------------------------------

def _openai_response(content: str, prompt_tokens: int = 100, completion_tokens: int = 50) -> httpx.Response:
    return httpx.Response(200, json={
        "choices": [{"message": {"content": content}}],
        "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens},
    })


class TestOpenAIAdapterRun:
    async def test_happy_path_returns_adapter_result(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        adapter = OpenAIAdapter()
        responses = [
            _openai_response(TRIAGE_JSON),
            _openai_response(ANALYSIS_JSON),
            _openai_response(RESPONSE_JSON),
        ]
        call_count = 0

        async def mock_post(*args, **kwargs):
            nonlocal call_count
            resp = responses[call_count]
            call_count += 1
            return resp

        with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=mock_post)):
            result = await adapter.run(_make_request())

        assert isinstance(result, AdapterResult)
        assert result.output.severity == "high"
        assert result.output.summary == "App crashes on checkout."
        assert result.output.recommended_action == "Rollback last deploy."
        assert len(result.steps) == 3
        assert result.steps[0].name == "triage"
        assert result.steps[1].name == "analysis"
        assert result.steps[2].name == "response"
        assert result.total_tokens > 0
        assert result.cost_usd > 0

    async def test_missing_api_key_raises_503(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        adapter = OpenAIAdapter()
        with pytest.raises(ProviderError) as exc_info:
            await adapter.run(_make_request())
        assert exc_info.value.status_code == 503

    async def test_429_raises_provider_error(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        adapter = OpenAIAdapter()

        async def mock_post(*args, **kwargs):
            return httpx.Response(429, json={"error": "rate limited"})

        with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=mock_post)):
            with pytest.raises(ProviderError) as exc_info:
                await adapter.run(_make_request())
        assert exc_info.value.status_code == 429

    async def test_non_200_raises_502(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        adapter = OpenAIAdapter()

        async def mock_post(*args, **kwargs):
            return httpx.Response(503, text="Service Unavailable")

        with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=mock_post)):
            with pytest.raises(ProviderError) as exc_info:
                await adapter.run(_make_request())
        assert exc_info.value.status_code == 502


# ---------------------------------------------------------------------------
# AnthropicAdapter — 3 sequential HTTP calls
# ---------------------------------------------------------------------------

def _anthropic_response(content: str, input_tokens: int = 100, output_tokens: int = 50) -> httpx.Response:
    return httpx.Response(200, json={
        "content": [{"text": content}],
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
    })


class TestAnthropicAdapterRun:
    async def test_happy_path_returns_adapter_result(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        adapter = AnthropicAdapter()
        responses = [
            _anthropic_response(TRIAGE_JSON),
            _anthropic_response(ANALYSIS_JSON),
            _anthropic_response(RESPONSE_JSON),
        ]
        call_count = 0

        async def mock_post(*args, **kwargs):
            nonlocal call_count
            resp = responses[call_count]
            call_count += 1
            return resp

        with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=mock_post)):
            result = await adapter.run(_make_request())

        assert isinstance(result, AdapterResult)
        assert result.output.severity == "high"
        assert len(result.steps) == 3

    async def test_missing_api_key_raises_503(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        adapter = AnthropicAdapter()
        with pytest.raises(ProviderError) as exc_info:
            await adapter.run(_make_request())
        assert exc_info.value.status_code == 503

    async def test_429_raises_provider_error(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        adapter = AnthropicAdapter()

        async def mock_post(*args, **kwargs):
            return httpx.Response(429, json={"error": "rate limited"})

        with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=mock_post)):
            with pytest.raises(ProviderError) as exc_info:
                await adapter.run(_make_request())
        assert exc_info.value.status_code == 429


# ---------------------------------------------------------------------------
# GeminiAdapter — 3 sequential HTTP calls
# ---------------------------------------------------------------------------

def _gemini_response(content: str, prompt_tokens: int = 100, candidates_tokens: int = 50) -> httpx.Response:
    return httpx.Response(200, json={
        "candidates": [{"content": {"parts": [{"text": content}]}}],
        "usageMetadata": {
            "promptTokenCount": prompt_tokens,
            "candidatesTokenCount": candidates_tokens,
        },
    })


class TestGeminiAdapterRun:
    async def test_happy_path_returns_adapter_result(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "AIza-test")
        adapter = GeminiAdapter()
        responses = [
            _gemini_response(TRIAGE_JSON),
            _gemini_response(ANALYSIS_JSON),
            _gemini_response(RESPONSE_JSON),
        ]
        call_count = 0

        async def mock_post(*args, **kwargs):
            nonlocal call_count
            resp = responses[call_count]
            call_count += 1
            return resp

        with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=mock_post)):
            result = await adapter.run(_make_request())

        assert isinstance(result, AdapterResult)
        assert result.output.severity == "high"
        assert len(result.steps) == 3

    async def test_missing_api_key_raises_503(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        adapter = GeminiAdapter()
        with pytest.raises(ProviderError) as exc_info:
            await adapter.run(_make_request())
        assert exc_info.value.status_code == 503
