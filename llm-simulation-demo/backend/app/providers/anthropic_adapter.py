from __future__ import annotations

import json
import time
from typing import Any, AsyncGenerator, Dict, Optional, Tuple

import httpx
import os

from app.models.request import RunRequest
from app.models.result import LLMStep, OutputEnvelope
from app.providers.base import (
    AdapterResult,
    ProviderError,
    StepEvent,
    _safe_json,
    calculate_cost,
    is_mocked_response,
    SYSTEM_PROMPT_TRIAGE,
    SYSTEM_PROMPT_ANALYSIS,
    SYSTEM_PROMPT_RESPONSE,
    build_triage_message,
    build_analysis_message,
    build_response_message,
)

_ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"

_TOOL_TRIAGE: Dict[str, Any] = {
    "name": "submit_triage",
    "description": "Submit the triage classification for a support ticket.",
    "input_schema": {
        "type": "object",
        "properties": {
            "severity": {
                "type": "string",
                "enum": ["low", "medium", "high", "critical"],
            },
            "category": {
                "type": "string",
                "enum": ["billing", "technical", "shipping", "account", "performance", "data", "integration", "mobile", "other"],
            },
            "urgency_score": {
                "type": "integer",
                "minimum": 1,
                "maximum": 10,
            },
            "escalation_required": {"type": "boolean"},
            "affected_component": {"type": "string"},
            "customer_sentiment": {
                "type": "string",
                "enum": ["frustrated", "neutral", "angry", "urgent"],
            },
        },
        "required": ["severity", "category", "urgency_score", "escalation_required", "affected_component", "customer_sentiment"],
    },
}

_TOOL_ANALYSIS: Dict[str, Any] = {
    "name": "submit_analysis",
    "description": "Submit the root cause analysis for a support ticket.",
    "input_schema": {
        "type": "object",
        "properties": {
            "root_cause": {"type": "string"},
            "customer_impact": {"type": "string"},
            "affected_systems": {"type": "array", "items": {"type": "string"}},
            "estimated_resolution_time": {"type": "string"},
            "investigation_steps": {"type": "array", "items": {"type": "string"}},
            "summary": {"type": "string"},
        },
        "required": ["root_cause", "customer_impact", "affected_systems", "estimated_resolution_time", "investigation_steps", "summary"],
    },
}

_TOOL_RESPONSE: Dict[str, Any] = {
    "name": "submit_response",
    "description": "Submit the drafted customer response for a support ticket.",
    "input_schema": {
        "type": "object",
        "properties": {
            "subject_line": {"type": "string"},
            "response_body": {"type": "string"},
            "recommended_action": {"type": "string"},
            "follow_up_required": {"type": "boolean"},
            "internal_notes": {"type": "string"},
        },
        "required": ["subject_line", "response_body", "recommended_action", "follow_up_required", "internal_notes"],
    },
}


class AnthropicAdapter:
    name = "anthropic"
    default_model = "claude-opus-4-7"

    async def stream(self, request: RunRequest, context: str = "") -> AsyncGenerator[StepEvent, None]:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise ProviderError("ANTHROPIC_API_KEY not configured", status_code=503)

        model = request.model or self.default_model

        triage_raw, p1, c1, d1, m1 = await self._call(
            api_key, model,
            system=SYSTEM_PROMPT_TRIAGE,
            user=build_triage_message(request),
            tool=_TOOL_TRIAGE,
        )
        triage = _safe_json(triage_raw, {})
        yield StepEvent(name="triage", data=triage, prompt_tokens=p1, completion_tokens=c1,
                        cost_usd=calculate_cost(model, p1, c1), duration_ms=d1, mocked=m1)

        analysis_raw, p2, c2, d2, m2 = await self._call(
            api_key, model,
            system=SYSTEM_PROMPT_ANALYSIS,
            user=build_analysis_message(request, triage, context),
            tool=_TOOL_ANALYSIS,
        )
        analysis = _safe_json(analysis_raw, {})
        yield StepEvent(name="analysis", data=analysis, prompt_tokens=p2, completion_tokens=c2,
                        cost_usd=calculate_cost(model, p2, c2), duration_ms=d2, mocked=m2)

        response_raw, p3, c3, d3, m3 = await self._call(
            api_key, model,
            system=SYSTEM_PROMPT_RESPONSE,
            user=build_response_message(request, triage, analysis),
            tool=_TOOL_RESPONSE,
        )
        response = _safe_json(response_raw, {})
        yield StepEvent(name="response", data=response, prompt_tokens=p3, completion_tokens=c3,
                        cost_usd=calculate_cost(model, p3, c3), duration_ms=d3, mocked=m3)

    async def run(self, request: RunRequest, context: str = "") -> AdapterResult:
        steps: list[LLMStep] = []
        step_data: dict[str, dict] = {}
        mocked_any = False
        async for event in self.stream(request, context):
            steps.append(LLMStep(
                name=event.name,
                prompt_tokens=event.prompt_tokens,
                completion_tokens=event.completion_tokens,
                cost_usd=event.cost_usd,
                duration_ms=event.duration_ms,
            ))
            step_data[event.name] = event.data
            if event.mocked:
                mocked_any = True

        triage = step_data.get("triage", {})
        analysis = step_data.get("analysis", {})
        response = step_data.get("response", {})

        output = OutputEnvelope(
            severity=triage.get("severity", "medium"),
            summary=analysis.get("summary", "Unable to analyze ticket."),
            recommended_action=response.get("recommended_action", "Escalate to L2 engineering."),
            root_cause=analysis.get("root_cause"),
            response_draft=response.get("response_body"),
        )
        total_tokens = sum(s.prompt_tokens + s.completion_tokens for s in steps)
        return AdapterResult(
            output=output,
            steps=steps,
            total_tokens=total_tokens,
            cost_usd=round(sum(s.cost_usd for s in steps), 6),
            mocked=mocked_any,
        )

    async def _call(
        self, api_key: str, model: str, system: str, user: str,
        tool: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, int, int, int, bool]:
        """Returns (content_json, prompt_tokens, completion_tokens, duration_ms, mocked)."""
        payload: Dict[str, Any] = {
            "model": model,
            "max_tokens": 2048,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        if tool:
            payload["tools"] = [tool]
            payload["tool_choice"] = {"type": "tool", "name": tool["name"]}

        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                _ANTHROPIC_API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": _ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json=payload,
            )
        duration_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code == 429:
            raise ProviderError("Anthropic rate limit exceeded", status_code=429)
        if resp.status_code != 200:
            raise ProviderError(f"Anthropic returned {resp.status_code}: {resp.text}", status_code=502)

        data = resp.json()
        usage = data.get("usage", {})

        if tool:
            for block in data.get("content", []):
                if block.get("type") == "tool_use":
                    content = json.dumps(block["input"])
                    break
            else:
                content = "{}"
        else:
            content = data["content"][0]["text"]

        return (
            content,
            usage.get("input_tokens", 0),
            usage.get("output_tokens", 0),
            duration_ms,
            is_mocked_response(resp.headers),
        )
