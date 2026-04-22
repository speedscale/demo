from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from app.models.request import RunRequest
from app.models.result import LLMStep, OutputEnvelope, RunResult, TimingInfo
from app.models.tool_call import ToolCallRecord
from app.providers.base import AdapterResult, ProviderError
from app.providers.openai_adapter import OpenAIAdapter
from app.providers.anthropic_adapter import AnthropicAdapter
from app.providers.gemini_adapter import GeminiAdapter
from app.providers.xai_adapter import XAIAdapter

app = FastAPI(
    title="Ticket Triage API",
    description="AI-powered support ticket analysis backend — 3-step pipeline per ticket.",
    version="1.4.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_ADAPTERS: Dict[str, Any] = {
    "openai":    OpenAIAdapter(),
    "anthropic": AnthropicAdapter(),
    "gemini":    GeminiAdapter(),
    "xai":       XAIAdapter(),
}

_PROVIDER_MODELS: Dict[str, List[str]] = {
    "openai":    ["gpt-5.4-mini", "gpt-5.4", "gpt-5.4-nano"],
    "anthropic": ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-5"],
    "gemini":    ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest"],
    "xai":       ["grok-4-1-fast-non-reasoning", "grok-4-1-fast-reasoning", "grok-4.20-0309-non-reasoning"],
}

_run_store: Dict[str, RunResult] = {}

_TOOL_BASE_URL = os.getenv("TOOL_BASE_URL", "http://llm-simulation-tools")


async def _call_tool(tool_name: str, path: str) -> ToolCallRecord:
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{_TOOL_BASE_URL}{path}")
        duration_ms = int((time.monotonic() - start) * 1000)
        if resp.status_code == 200:
            return ToolCallRecord(
                name=tool_name, status="ok", duration_ms=duration_ms, result=resp.json()
            )
        return ToolCallRecord(
            name=tool_name,
            status="error",
            duration_ms=duration_ms,
            error=f"HTTP {resp.status_code}",
        )
    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        return ToolCallRecord(
            name=tool_name, status="error", duration_ms=duration_ms, error=str(exc)
        )


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/api/providers")
async def list_providers():
    default_provider = os.getenv("DEFAULT_PROVIDER", "openai")
    return {
        "providers": [
            {
                "id": name,
                "models": models,
                "default_model": _ADAPTERS[name].default_model,
                "configured": bool(os.getenv(f"{name.upper()}_API_KEY")),
            }
            for name, models in _PROVIDER_MODELS.items()
        ],
        "default_provider": default_provider,
    }


@app.post("/api/run", response_model=RunResult)
async def run_task(request: RunRequest) -> RunResult:
    total_start = time.monotonic()
    request_id = f"req_{uuid.uuid4().hex}"

    adapter = _ADAPTERS.get(request.provider)
    if not adapter:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {request.provider}")

    model_used = request.model or adapter.default_model

    # Fetch tool data in parallel before calling the LLM so results can
    # enrich the analysis prompt.
    order_tool, policy_tool = await asyncio.gather(
        _call_tool("lookup_order", f"/tools/order/{request.input.ticket_id}"),
        _call_tool("lookup_policy", "/tools/policy/return-policy-v2"),
    )
    tool_calls = [order_tool, policy_tool]

    # Build a context string from tool results to pass into the LLM prompts.
    context_parts: list[str] = []
    if order_tool.status == "ok" and order_tool.result:
        context_parts.append(f"Order Data: {json.dumps(order_tool.result)}")
    if policy_tool.status == "ok" and policy_tool.result:
        context_parts.append(f"Return Policy: {json.dumps(policy_tool.result)}")
    context = "\n".join(context_parts)

    adapter_result: Optional[AdapterResult] = None
    provider_error: Optional[str] = None

    provider_start = time.monotonic()
    try:
        adapter_result = await adapter.run(request, context=context)
    except ProviderError as exc:
        provider_error = str(exc)
    provider_ms = int((time.monotonic() - provider_start) * 1000)

    if adapter_result is None:
        fallback_output = OutputEnvelope(
            summary="Unable to process the ticket due to a provider error.",
            severity="high",
            recommended_action="Check the provider API key configuration and retry.",
        )
        adapter_result = AdapterResult(output=fallback_output)

    total_ms = int((time.monotonic() - total_start) * 1000)

    result = RunResult(
        request_id=request_id,
        provider=request.provider,
        model=model_used,
        output=adapter_result.output,
        steps=adapter_result.steps,
        tool_calls=tool_calls,
        timing=TimingInfo(provider_ms=provider_ms, total_ms=total_ms),
        total_tokens=adapter_result.total_tokens,
        cost_usd=adapter_result.cost_usd,
        error=provider_error,
    )

    _run_store[request_id] = result
    return result


@app.get("/api/runs/{run_id}", response_model=RunResult)
async def get_run(run_id: str):
    result = _run_store.get(run_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    return result


@app.get("/api/runs")
async def list_runs(limit: int = 20):
    runs = list(_run_store.values())
    return {"runs": runs[-limit:], "total": len(runs)}
