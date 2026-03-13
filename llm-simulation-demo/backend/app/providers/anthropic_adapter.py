from __future__ import annotations

import json
import os

import httpx

from app.models.request import RunRequest
from app.models.result import OutputEnvelope
from app.providers.base import ProviderError, SYSTEM_PROMPT, build_user_message

_ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"


class AnthropicAdapter:
    name = "anthropic"
    default_model = "claude-3-5-haiku-latest"

    async def run(self, request: RunRequest) -> OutputEnvelope:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise ProviderError("ANTHROPIC_API_KEY not configured", status_code=503)

        model = request.model or self.default_model
        payload = {
            "model": model,
            "max_tokens": 512,
            "system": SYSTEM_PROMPT,
            "messages": [
                {"role": "user", "content": build_user_message(request)},
            ],
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _ANTHROPIC_API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": _ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json=payload,
            )

        if resp.status_code == 429:
            raise ProviderError("Anthropic rate limit exceeded", status_code=429)
        if resp.status_code != 200:
            raise ProviderError(
                f"Anthropic returned {resp.status_code}: {resp.text}", status_code=502
            )

        data = resp.json()
        raw = data["content"][0]["text"]
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
            f"Anthropic response parse error: {exc}", status_code=502
        ) from exc
