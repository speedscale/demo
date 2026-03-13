"""Fake tool endpoints for order and policy lookups.

These endpoints are intentionally hackable via query params so we can simulate
failure modes deterministically without touching real systems.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Query, Response
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/tools", tags=["tools"])


def _chaos_response(status: int | None, malformed: bool, delay_ms: int, normal_body: dict) -> Response:
    if delay_ms > 0:
        # Delay is handled by the caller if needed; here we return it as-is for async handling
        pass

    if status == 500:
        return JSONResponse({"error": "internal tool error"}, status_code=500)
    if status == 429:
        return JSONResponse({"error": "tool rate limited"}, status_code=429)
    if malformed:
        # Return syntactically valid JSON but with renamed/missing fields
        drifted = {f"_old_{k}": v for k, v in normal_body.items()}
        return JSONResponse(drifted)

    return JSONResponse(normal_body)


@router.get("/order/{order_id}")
async def lookup_order(
    order_id: str,
    inject_status: int | None = Query(default=None),
    inject_malformed: bool = Query(default=False),
    inject_delay_ms: int = Query(default=0, ge=0),
) -> Response:
    if inject_delay_ms > 0:
        await asyncio.sleep(inject_delay_ms / 1000)

    normal = {
        "order_id": order_id,
        "status": "shipped",
        "items": ["widget-a", "widget-b"],
        "shipping_address": "123 Main St, Springfield",
        "estimated_delivery": "2026-03-15",
    }
    return _chaos_response(inject_status, inject_malformed, inject_delay_ms, normal)


@router.get("/policy/{policy_id}")
async def lookup_policy(
    policy_id: str,
    inject_status: int | None = Query(default=None),
    inject_malformed: bool = Query(default=False),
    inject_delay_ms: int = Query(default=0, ge=0),
) -> Response:
    if inject_delay_ms > 0:
        await asyncio.sleep(inject_delay_ms / 1000)

    normal = {
        "policy_id": policy_id,
        "name": "30-Day Return Policy",
        "eligible": True,
        "conditions": "Item must be unused and in original packaging.",
    }
    return _chaos_response(inject_status, inject_malformed, inject_delay_ms, normal)
