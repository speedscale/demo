from __future__ import annotations

from app.providers.openai_adapter import OpenAIAdapter

_XAI_API_URL = "https://api.x.ai/v1/chat/completions"


class XAIAdapter(OpenAIAdapter):
    """Grok (xAI) adapter — uses the same OpenAI-compatible API at a different base URL."""

    name = "xai"
    default_model = "grok-4.20-0309-non-reasoning"
    _api_key_env = "XAI_API_KEY"
    _api_base_url = _XAI_API_URL
