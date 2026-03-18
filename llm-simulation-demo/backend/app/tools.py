"""Tool endpoints for order and policy lookups."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("/order/{order_id}")
async def lookup_order(order_id: str):
    return JSONResponse({
        "order_id": order_id,
        "status": "shipped",
        "items": ["widget-a", "widget-b"],
        "shipping_address": "123 Main St, Springfield",
        "estimated_delivery": "2026-03-25",
    })


@router.get("/policy/{policy_id}")
async def lookup_policy(policy_id: str):
    return JSONResponse({
        "policy_id": policy_id,
        "name": "30-Day Return Policy",
        "eligible": True,
        "conditions": "Item must be unused and in original packaging.",
    })
