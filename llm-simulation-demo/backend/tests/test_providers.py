"""Unit tests for provider adapter parse helpers and message builder.

These tests never make real HTTP requests.  They exercise the private
_parse_output functions directly and use httpx.MockTransport to simulate
provider API responses for the full adapter.run() path.
"""
from __future__ import annotations

import json
from unittest.mock import patch, AsyncMock

import httpx
import pytest

from app.models.request import RunRequest
from app.models.result import OutputEnvelope
from app.providers.base import ProviderError, build_user_message
from app.providers.openai_adapter import OpenAIAdapter, _parse_output as oai_parse
from app.providers.anthropic_adapter import AnthropicAdapter, _parse_output as ant_parse
from app.providers.gemini_adapter import GeminiAdapter, _parse_output as gem_parse


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _make_request(**sim_overrides) -> RunRequest:
    return RunRequest(
        task="summarize_ticket",
        provider="openai",
        input={
            "ticket_id": "INC-99",
            "customer_tier": "enterprise",
            "transcript": "App crashes on checkout.",
        },
        simulation=sim_overrides or {},
    )


GOOD_OUTPUT_JSON = json.dumps({
    "summary": "App crashes on checkout.",
    "severity": "high",
    "recommended_action": "Rollback last deploy.",
})


# ---------------------------------------------------------------------------
# build_user_message
# ---------------------------------------------------------------------------

class TestBuildUserMessage:
    def test_contains_all_ticket_fields(self):
        req = _make_request()
        msg = build_user_message(req)
        assert "INC-99" in msg
        assert "enterprise" in msg
        assert "App crashes on checkout." in msg

    def test_format_labels_present(self):
        req = _make_request()
        msg = build_user_message(req)
        assert "Ticket ID:" in msg
        assert "Customer Tier:" in msg
        assert "Transcript:" in msg


# ---------------------------------------------------------------------------
# OpenAI _parse_output
# ---------------------------------------------------------------------------

class TestOpenAIParse:
    def test_valid_json(self):
        out = oai_parse(GOOD_OUTPUT_JSON)
        assert isinstance(out, OutputEnvelope)
        assert out.severity == "high"
        assert "checkout" in out.summary

    def test_missing_severity_defaults_to_medium(self):
        raw = json.dumps({"summary": "x", "recommended_action": "y"})
        out = oai_parse(raw)
        assert out.severity == "medium"

    def test_invalid_json_raises_provider_error(self):
        with pytest.raises(ProviderError) as exc_info:
            oai_parse("not valid json {{")
        assert exc_info.value.status_code == 502

    def test_empty_string_raises_provider_error(self):
        with pytest.raises(ProviderError):
            oai_parse("")


# ---------------------------------------------------------------------------
# Anthropic _parse_output
# ---------------------------------------------------------------------------

class TestAnthropicParse:
    def test_valid_json(self):
        out = ant_parse(GOOD_OUTPUT_JSON)
        assert out.severity == "high"

    def test_invalid_json_raises_provider_error(self):
        with pytest.raises(ProviderError) as exc_info:
            ant_parse("{broken")
        assert exc_info.value.status_code == 502


# ---------------------------------------------------------------------------
# Gemini _parse_output
# ---------------------------------------------------------------------------

class TestGeminiParse:
    def test_valid_json(self):
        out = gem_parse(GOOD_OUTPUT_JSON)
        assert out.recommended_action == "Rollback last deploy."

    def test_invalid_json_raises_provider_error(self):
        with pytest.raises(ProviderError):
            gem_parse("[]")  # valid JSON but wrong type (list not dict)


# ---------------------------------------------------------------------------
# OpenAIAdapter.run — full path with mocked HTTP
# ---------------------------------------------------------------------------

def _openai_http_response(content: str, status: int = 200) -> httpx.Response:
    body = {
        "choices": [{"message": {"content": content}}]
    }
    return httpx.Response(status, json=body)


class TestOpenAIAdapterRun:
    async def test_happy_path(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        adapter = OpenAIAdapter()

        async def mock_post(*args, **kwargs):
            return _openai_http_response(GOOD_OUTPUT_JSON)

        with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=mock_post)):
            result = await adapter.run(_make_request())

        assert result.severity == "high"

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
# AnthropicAdapter.run — full path with mocked HTTP
# ---------------------------------------------------------------------------

def _anthropic_http_response(content: str, status: int = 200) -> httpx.Response:
    body = {"content": [{"text": content}]}
    return httpx.Response(status, json=body)


class TestAnthropicAdapterRun:
    async def test_happy_path(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        adapter = AnthropicAdapter()

        async def mock_post(*args, **kwargs):
            return _anthropic_http_response(GOOD_OUTPUT_JSON)

        with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=mock_post)):
            result = await adapter.run(_make_request())

        assert result.severity == "high"

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
# GeminiAdapter.run — full path with mocked HTTP
# ---------------------------------------------------------------------------

def _gemini_http_response(content: str, status: int = 200) -> httpx.Response:
    body = {"candidates": [{"content": {"parts": [{"text": content}]}}]}
    return httpx.Response(status, json=body)


class TestGeminiAdapterRun:
    async def test_happy_path(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "AIza-test")
        adapter = GeminiAdapter()

        async def mock_post(*args, **kwargs):
            return _gemini_http_response(GOOD_OUTPUT_JSON)

        with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=mock_post)):
            result = await adapter.run(_make_request())

        assert result.severity == "high"

    async def test_missing_api_key_raises_503(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        adapter = GeminiAdapter()
        with pytest.raises(ProviderError) as exc_info:
            await adapter.run(_make_request())
        assert exc_info.value.status_code == 503
