from __future__ import annotations

import time
from typing import Tuple

import httpx

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
import os

_OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"


class OpenAIAdapter:
    name = "openai"
    default_model = "gpt-4.1-mini"

    async def run(self, request: RunRequest, context: str = "") -> AdapterResult:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ProviderError("OPENAI_API_KEY not configured", status_code=503)

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
        self,
        api_key: str,
        model: str,
        system: str,
        user: str,
        base_url: str = _OPENAI_API_URL,
        auth_header: str | None = None,
    ) -> Tuple[str, int, int, int]:
        """Returns (content, prompt_tokens, completion_tokens, duration_ms)."""
        headers = {"Authorization": f"Bearer {auth_header or api_key}"}
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
            "max_tokens": 2048,
        }
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(base_url, headers=headers, json=payload)
        duration_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code == 429:
            raise ProviderError("OpenAI rate limit exceeded", status_code=429)
        if resp.status_code != 200:
            raise ProviderError(f"OpenAI returned {resp.status_code}: {resp.text}", status_code=502)

        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return content, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), duration_ms
