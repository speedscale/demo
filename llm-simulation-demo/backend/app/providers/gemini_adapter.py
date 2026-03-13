from __future__ import annotations

import json
import os

import httpx

from app.models.request import RunRequest
from app.models.result import OutputEnvelope
from app.providers.base import ProviderError, SYSTEM_PROMPT, build_user_message

_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiAdapter:
    name = "gemini"
    default_model = "gemini-flash-latest"

    async def run(self, request: RunRequest) -> OutputEnvelope:
        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            raise ProviderError("GEMINI_API_KEY not configured", status_code=503)

        model = request.model or self.default_model
        url = f"{_GEMINI_API_BASE}/{model}:generateContent?key={api_key}"

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"{SYSTEM_PROMPT}\n\n{build_user_message(request)}"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)

        if resp.status_code == 429:
            raise ProviderError("Gemini rate limit exceeded", status_code=429)
        if resp.status_code != 200:
            raise ProviderError(
                f"Gemini returned {resp.status_code}: {resp.text}", status_code=502
            )

        data = resp.json()
        raw = data["candidates"][0]["content"]["parts"][0]["text"]
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
            f"Gemini response parse error: {exc}", status_code=502
        ) from exc
