from __future__ import annotations

import asyncio
import os
import time
import uuid
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models.request import RunRequest
from app.models.result import OutputEnvelope, RunResult, SimulationEcho, TimingInfo
from app.models.tool_call import ToolCallRecord
from app.providers.base import ProviderError
from app.providers.openai_adapter import OpenAIAdapter
from app.providers.anthropic_adapter import AnthropicAdapter
from app.providers.gemini_adapter import GeminiAdapter
from app.tools import router as tools_router

app = FastAPI(
    title="LLM Simulation Demo",
    description="Backend for simulating LLM provider failures, latency, and schema drift.",
    version="1.3.5",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tools_router)

_ADAPTERS: Dict[str, Any] = {
    "openai": OpenAIAdapter(),
    "anthropic": AnthropicAdapter(),
    "gemini": GeminiAdapter(),
}

_PROVIDER_MODELS: Dict[str, List[str]] = {
    "openai": ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
    "anthropic": [
        "claude-3-5-haiku-latest",
        "claude-3-5-sonnet-latest",
        "claude-3-7-sonnet-latest",
    ],
    "gemini": ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest"],
}

_run_store: Dict[str, RunResult] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _call_tool(
    base_url: str,
    tool_name: str,
    path: str,
    inject_malformed: bool,
    inject_status: Optional[int],
    inject_delay_ms: int,
) -> ToolCallRecord:
    params: Dict[str, Any] = {}
    if inject_malformed:
        params["inject_malformed"] = "true"
    if inject_status:
        params["inject_status"] = inject_status
    if inject_delay_ms:
        params["inject_delay_ms"] = inject_delay_ms

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{base_url}{path}", params=params)
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


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
                "configured": bool(
                    os.getenv(f"{name.upper()}_API_KEY")
                    or (name == "gemini" and os.getenv("GEMINI_API_KEY"))
                ),
            }
            for name, models in _PROVIDER_MODELS.items()
        ],
        "default_provider": default_provider,
    }


@app.get("/api/scenarios")
async def list_scenarios():
    return {
        "scenarios": [
            {
                "id": "baseline-ticket",
                "name": "Baseline ticket",
                "description": "Standard support ticket with no simulation.",
            },
            {
                "id": "provider-timeout",
                "name": "Provider timeout",
                "description": "Primary provider stalls; backend falls back.",
            },
            {
                "id": "malformed-tool-response",
                "name": "Malformed tool response",
                "description": "Tool lookup returns schema-drifted JSON.",
            },
            {
                "id": "fallback-to-openai",
                "name": "Fallback to OpenAI",
                "description": "Anthropic returns 429; request retries with OpenAI.",
            },
            {
                "id": "tool-failure",
                "name": "Tool failure",
                "description": "Order lookup returns 500; severity escalates.",
            },
        ]
    }


@app.post("/api/scenarios/{scenario_id}/run")
async def run_scenario(scenario_id: str):
    scenarios: Dict[str, RunRequest] = {
        "baseline-ticket": RunRequest(
            task="summarize_ticket",
            provider="openai",
            input={
                "ticket_id": "INC-1001",
                "customer_tier": "enterprise",
                "transcript": "Customer cannot complete checkout after address update",
            },
        ),
        "provider-timeout": RunRequest(
            task="summarize_ticket",
            provider="anthropic",
            input={
                "ticket_id": "INC-1002",
                "customer_tier": "standard",
                "transcript": "Payment declined on retry after timeout",
            },
            simulation={
                "mode": "chaos",
                "inject_latency_ms": 3000,
                "fallback_provider": "openai",
            },
        ),
        "malformed-tool-response": RunRequest(
            task="summarize_ticket",
            provider="openai",
            input={
                "ticket_id": "INC-1003",
                "customer_tier": "enterprise",
                "transcript": "Order tracking shows no data",
            },
            simulation={"mode": "chaos", "inject_malformed_tool_json": True},
        ),
        "fallback-to-openai": RunRequest(
            task="summarize_ticket",
            provider="anthropic",
            input={
                "ticket_id": "INC-1004",
                "customer_tier": "vip",
                "transcript": "Subscription renewal failed silently",
            },
            simulation={
                "mode": "chaos",
                "inject_status": 429,
                "fallback_provider": "openai",
            },
        ),
        "tool-failure": RunRequest(
            task="summarize_ticket",
            provider="openai",
            input={
                "ticket_id": "INC-1005",
                "customer_tier": "standard",
                "transcript": "Cannot view order history",
            },
            simulation={"mode": "chaos", "inject_status": 500},
        ),
    }
    req = scenarios.get(scenario_id)
    if not req:
        raise HTTPException(
            status_code=404, detail=f"Scenario '{scenario_id}' not found"
        )
    return await run_task(req)


@app.post("/api/run", response_model=RunResult)
async def run_task(request: RunRequest) -> RunResult:
    total_start = time.monotonic()
    request_id = f"req_{uuid.uuid4().hex}"
    sim = request.simulation
    provider_name = request.provider
    adapter = _ADAPTERS.get(provider_name)
    if not adapter:
        raise HTTPException(
            status_code=400, detail=f"Unknown provider: {provider_name}"
        )

    # Inject latency before calling provider
    if sim.inject_latency_ms > 0:
        await asyncio.sleep(sim.inject_latency_ms / 1000)

    # Simulate a provider-level HTTP error (e.g. 429) before real call
    fallback_triggered = False
    provider_used = provider_name
    output: Optional[OutputEnvelope] = None
    provider_error: Optional[str] = None

    provider_start = time.monotonic()
    try:
        if sim.inject_status == 429:
            raise ProviderError(
                f"{provider_name} rate limited (simulated)", status_code=429
            )
        output = await adapter.run(request)
    except ProviderError as exc:
        provider_error = str(exc)
        # Try fallback
        fallback = sim.fallback_provider
        if fallback and fallback in _ADAPTERS and fallback != provider_name:
            fallback_triggered = True
            provider_used = fallback
            try:
                fallback_request = request.model_copy(
                    update={
                        "provider": fallback,
                        "simulation": request.simulation.model_copy(
                            update={"inject_status": None}
                        ),
                    }
                )
                output = await _ADAPTERS[fallback].run(fallback_request)
            except ProviderError as fb_exc:
                provider_error = f"Primary: {provider_error}; Fallback: {fb_exc}"
    provider_ms = int((time.monotonic() - provider_start) * 1000)

    if output is None:
        # Return a graceful degraded response
        output = OutputEnvelope(
            summary="Unable to process ticket due to provider error.",
            severity="high",
            recommended_action="Escalate to on-call engineer and retry with alternate provider.",
        )

    # Tool calls (run after provider for demonstration; order is intentional for replay clarity)
    self_base = "http://localhost:8000"
    tool_calls: List[ToolCallRecord] = []

    order_tool = await _call_tool(
        self_base,
        "lookup_order",
        f"/tools/order/{request.input.ticket_id}",
        inject_malformed=sim.inject_malformed_tool_json,
        inject_status=sim.inject_status if sim.inject_status == 500 else None,
        inject_delay_ms=0,
    )
    tool_calls.append(order_tool)

    policy_tool = await _call_tool(
        self_base,
        "lookup_policy",
        "/tools/policy/return-policy-v2",
        inject_malformed=False,
        inject_status=None,
        inject_delay_ms=0,
    )
    tool_calls.append(policy_tool)

    total_ms = int((time.monotonic() - total_start) * 1000)

    result = RunResult(
        request_id=request_id,
        provider_requested=provider_name,
        provider_used=provider_used,
        fallback_triggered=fallback_triggered,
        output=output,
        tool_calls=tool_calls,
        timing=TimingInfo(provider_ms=provider_ms, total_ms=total_ms),
        simulation=SimulationEcho(
            inject_latency_ms=sim.inject_latency_ms,
            inject_status=sim.inject_status,
            inject_malformed_tool_json=sim.inject_malformed_tool_json,
        ),
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
