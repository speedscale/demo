from __future__ import annotations

import json
import os

import httpx

from app.models.request import RunRequest
from app.models.result import OutputEnvelope
from app.providers.base import ProviderError, SYSTEM_PROMPT, build_user_message

_OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"


class OpenAIAdapter:
    name = "openai"
    default_model = "gpt-4.1-mini"

    async def run(self, request: RunRequest) -> OutputEnvelope:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ProviderError("OPENAI_API_KEY not configured", status_code=503)

        model = request.model or self.default_model
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_message(request)},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _OPENAI_API_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )

        if resp.status_code == 429:
            raise ProviderError("OpenAI rate limit exceeded", status_code=429)
        if resp.status_code != 200:
            raise ProviderError(
                f"OpenAI returned {resp.status_code}: {resp.text}", status_code=502
            )

        data = resp.json()
        raw = data["choices"][0]["message"]["content"]
        return _parse_output(raw)


def _parse_output(raw: str) -> OutputEnvelope:
    try:
        obj = json.loads(raw)
        return OutputEnvelope(
            summary=obj.get("summary", ""),
            severity=obj.get("severity", "medium"),
            recommended_action=obj.get("recommended_action", ""),
        )
    except Exception as exc:
        raise ProviderError(
            f"OpenAI response parse error: {exc}", status_code=502
        ) from exc
