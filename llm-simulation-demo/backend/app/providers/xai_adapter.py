from __future__ import annotations

import os
from typing import Tuple

from app.models.request import RunRequest
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
from app.models.result import LLMStep, OutputEnvelope
from app.providers.openai_adapter import OpenAIAdapter

_XAI_API_URL = "https://api.x.ai/v1/chat/completions"


class XAIAdapter(OpenAIAdapter):
    """Grok (xAI) adapter — uses the same OpenAI-compatible API at a different base URL."""

    name = "xai"
    default_model = "grok-4-1-fast-non-reasoning"

    async def run(self, request: RunRequest, context: str = "") -> AdapterResult:
        api_key = os.getenv("XAI_API_KEY", "")
        if not api_key:
            raise ProviderError("XAI_API_KEY not configured", status_code=503)

        model = request.model or self.default_model
        steps: list[LLMStep] = []

        triage_raw, p1, c1, d1 = await self._call(
            api_key, model,
            system=SYSTEM_PROMPT_TRIAGE,
            user=build_triage_message(request),
            base_url=_XAI_API_URL,
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
            base_url=_XAI_API_URL,
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
            base_url=_XAI_API_URL,
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
