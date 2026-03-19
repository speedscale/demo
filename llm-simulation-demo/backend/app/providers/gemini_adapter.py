from __future__ import annotations

import time
from typing import Tuple

import httpx
import os

from app.models.request import RunRequest
from app.models.result import LLMStep, OutputEnvelope
from app.providers.base import (
    AdapterResult,
    ProviderError,
    _safe_json,
    calculate_cost,
    SYSTEM_PROMPT_TRIAGE,
    SYSTEM_PROMPT_ANALYSIS,
    SYSTEM_PROMPT_RESPONSE,
    build_triage_message,
    build_analysis_message,
    build_response_message,
)

_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiAdapter:
    name = "gemini"
    default_model = "gemini-flash-latest"

    async def run(self, request: RunRequest, context: str = "") -> AdapterResult:
        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            raise ProviderError("GEMINI_API_KEY not configured", status_code=503)

        model = request.model or self.default_model
        steps: list[LLMStep] = []

        triage_raw, p1, c1, d1 = await self._call(
            api_key, model,
            system=SYSTEM_PROMPT_TRIAGE,
            user=build_triage_message(request),
        )
        triage = _safe_json(triage_raw, {})
        steps.append(LLMStep(
            name="triage",
            prompt_tokens=p1, completion_tokens=c1,
            cost_usd=calculate_cost(model, p1, c1),
            duration_ms=d1,
        ))

        analysis_raw, p2, c2, d2 = await self._call(
            api_key, model,
            system=SYSTEM_PROMPT_ANALYSIS,
            user=build_analysis_message(request, triage, context),
        )
        analysis = _safe_json(analysis_raw, {})
        steps.append(LLMStep(
            name="analysis",
            prompt_tokens=p2, completion_tokens=c2,
            cost_usd=calculate_cost(model, p2, c2),
            duration_ms=d2,
        ))

        response_raw, p3, c3, d3 = await self._call(
            api_key, model,
            system=SYSTEM_PROMPT_RESPONSE,
            user=build_response_message(request, triage, analysis),
        )
        response = _safe_json(response_raw, {})
        steps.append(LLMStep(
            name="response",
            prompt_tokens=p3, completion_tokens=c3,
            cost_usd=calculate_cost(model, p3, c3),
            duration_ms=d3,
        ))

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
        )

    async def _call(
        self, api_key: str, model: str, system: str, user: str
    ) -> Tuple[str, int, int, int]:
        """Returns (content, prompt_tokens, completion_tokens, duration_ms)."""
        url = f"{_GEMINI_API_BASE}/{model}:generateContent?key={api_key}"
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
                "maxOutputTokens": 2048,
            },
        }
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload)
        duration_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code == 429:
            raise ProviderError("Gemini rate limit exceeded", status_code=429)
        if resp.status_code != 200:
            raise ProviderError(f"Gemini returned {resp.status_code}: {resp.text}", status_code=502)

        data = resp.json()
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        usage = data.get("usageMetadata", {})
        prompt_tokens = usage.get("promptTokenCount", 0)
        completion_tokens = usage.get("candidatesTokenCount", 0)
        return content, prompt_tokens, completion_tokens, duration_ms
