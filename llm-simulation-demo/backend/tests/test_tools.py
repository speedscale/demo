"""Tests for the /tools/* chaos-injection endpoints."""
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
        # No drift fields present
        assert not any(k.startswith("_old_") for k in body)

    async def test_inject_500(self, client):
        r = await client.get("/tools/order/ORD-002?inject_status=500")
        assert r.status_code == 500
        assert "error" in r.json()

    async def test_inject_429(self, client):
        r = await client.get("/tools/order/ORD-002?inject_status=429")
        assert r.status_code == 429
        assert "error" in r.json()

    async def test_inject_malformed_renames_all_fields(self, client):
        r = await client.get("/tools/order/ORD-003?inject_malformed=true")
        assert r.status_code == 200
        body = r.json()
        # Every key should be prefixed with _old_
        for k in body:
            assert k.startswith("_old_"), f"Expected drifted field, got: {k}"
        # Original fields must not be present
        assert "order_id" not in body
        assert "status" not in body

    async def test_normal_fields_present_without_malformed(self, client):
        r = await client.get("/tools/order/ORD-004?inject_malformed=false")
        assert r.status_code == 200
        body = r.json()
        assert "order_id" in body

    async def test_order_id_echoed(self, client):
        r = await client.get("/tools/order/MY-SPECIAL-ID")
        assert r.json()["order_id"] == "MY-SPECIAL-ID"


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

    async def test_inject_500(self, client):
        r = await client.get("/tools/policy/POL-002?inject_status=500")
        assert r.status_code == 500

    async def test_inject_malformed(self, client):
        r = await client.get("/tools/policy/POL-003?inject_malformed=true")
        assert r.status_code == 200
        body = r.json()
        for k in body:
            assert k.startswith("_old_")

    async def test_policy_id_echoed(self, client):
        r = await client.get("/tools/policy/return-policy-v2")
        assert r.json()["policy_id"] == "return-policy-v2"


# ---------------------------------------------------------------------------
# _chaos_response unit-level checks (via the router, not the helper directly)
# ---------------------------------------------------------------------------

class TestChaosResponseLogic:
    async def test_unknown_status_falls_through_to_normal(self, client):
        """Status codes other than 429/500 are not special-cased; normal body returned."""
        r = await client.get("/tools/order/ORD-007?inject_status=418")
        # 418 is not handled by _chaos_response, so normal body is returned
        assert r.status_code == 200
        assert "order_id" in r.json()

    async def test_inject_delay_does_not_break_response(self, client):
        """A small delay still returns a valid response."""
        r = await client.get("/tools/order/ORD-008?inject_delay_ms=50")
        assert r.status_code == 200
        assert r.json()["order_id"] == "ORD-008"

    async def test_negative_delay_rejected(self, client):
        """inject_delay_ms must be >= 0."""
        r = await client.get("/tools/order/ORD-009?inject_delay_ms=-1")
        assert r.status_code == 422
