"""Tests for the tools-service endpoints."""
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


class TestHealthz:
    async def test_returns_ok(self, client):
        r = await client.get("/healthz")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestOrderTool:
    async def test_known_ticket_returns_record(self, client):
        r = await client.get("/tools/order/INC-4201")
        assert r.status_code == 200
        body = r.json()
        assert body["ticket_id"] == "INC-4201"
        assert body["account_tier"] == "enterprise"
        assert body["order_value_usd"] == 47230.00

    async def test_unknown_id_returns_fallback(self, client):
        r = await client.get("/tools/order/UNKNOWN-9999")
        assert r.status_code == 200
        body = r.json()
        assert "order_id" in body
        assert body["status"] == "active"

    async def test_response_has_required_fields(self, client):
        r = await client.get("/tools/order/INC-4202")
        body = r.json()
        assert "status" in body
        assert "customer" in body
        assert "account_tier" in body


class TestPolicyTool:
    async def test_known_policy(self, client):
        r = await client.get("/tools/policy/return-policy-v2")
        assert r.status_code == 200
        body = r.json()
        assert body["policy_id"] == "return-policy-v2"
        assert "eligible_window_days" in body

    async def test_enterprise_sla_policy(self, client):
        r = await client.get("/tools/policy/enterprise-sla-v1")
        assert r.status_code == 200
        body = r.json()
        assert body["response_time_hours"] == 4

    async def test_unknown_policy_returns_default(self, client):
        r = await client.get("/tools/policy/nonexistent-policy")
        assert r.status_code == 200
        body = r.json()
        assert "name" in body

    async def test_gdpr_policy(self, client):
        r = await client.get("/tools/policy/data-privacy-v3")
        assert r.status_code == 200
        body = r.json()
        assert body["gdpr_erasure_window_days"] == 30
