"""Tests for the /tools/* endpoints."""
from __future__ import annotations

import pytest
import httpx

from app.main import app


@pytest.fixture
async def client():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# /tools/order/{order_id}
# ---------------------------------------------------------------------------

class TestOrderTool:
    async def test_normal_response(self, client):
        r = await client.get("/tools/order/ORD-001")
        assert r.status_code == 200
        body = r.json()
        assert body["order_id"] == "ORD-001"
        assert body["status"] == "shipped"
        assert "items" in body
        assert "estimated_delivery" in body

    async def test_order_id_echoed(self, client):
        r = await client.get("/tools/order/MY-SPECIAL-ID")
        assert r.json()["order_id"] == "MY-SPECIAL-ID"

    async def test_no_chaos_params_accepted(self, client):
        """Chaos query params are no longer supported; they are silently ignored."""
        r = await client.get("/tools/order/ORD-002?inject_status=500")
        assert r.status_code == 200
        assert "order_id" in r.json()


# ---------------------------------------------------------------------------
# /tools/policy/{policy_id}
# ---------------------------------------------------------------------------

class TestPolicyTool:
    async def test_normal_response(self, client):
        r = await client.get("/tools/policy/POL-001")
        assert r.status_code == 200
        body = r.json()
        assert body["policy_id"] == "POL-001"
        assert "name" in body
        assert "eligible" in body
        assert "conditions" in body

    async def test_policy_id_echoed(self, client):
        r = await client.get("/tools/policy/return-policy-v2")
        assert r.json()["policy_id"] == "return-policy-v2"
