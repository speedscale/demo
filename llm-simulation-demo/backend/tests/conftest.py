"""Shared fixtures for the LLM Simulation Demo backend test suite."""
from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.main import app
from app.models.request import RunRequest, TicketInput
from app.models.result import OutputEnvelope
from app.models.tool_call import ToolCallRecord
from app.providers.base import AdapterResult


# ---------------------------------------------------------------------------
# HTTP test client
# ---------------------------------------------------------------------------

@pytest.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """Async test client that talks directly to the ASGI app — no real sockets."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# Reusable request / response objects
# ---------------------------------------------------------------------------

@pytest.fixture
def ticket_input() -> TicketInput:
    return TicketInput(
        ticket_id="INC-TEST-01",
        customer_tier="enterprise",
        transcript="Customer cannot complete checkout after address update.",
    )


@pytest.fixture
def run_request(ticket_input: TicketInput) -> RunRequest:
    return RunRequest(
        provider="openai",
        input=ticket_input,
    )


@pytest.fixture
def good_output() -> OutputEnvelope:
    return OutputEnvelope(
        summary="Checkout fails after address normalization changed tax calculation.",
        severity="high",
        recommended_action="Rollback tax rule change and notify support.",
    )


@pytest.fixture
def mock_tool_ok() -> ToolCallRecord:
    return ToolCallRecord(name="lookup_order", status="ok", duration_ms=12,
                          result={"order_id": "INC-TEST-01", "status": "shipped"})


@pytest.fixture
def mock_tool_error() -> ToolCallRecord:
    return ToolCallRecord(name="lookup_order", status="error", duration_ms=5,
                          error="HTTP 500")


# ---------------------------------------------------------------------------
# Mock provider adapter
# ---------------------------------------------------------------------------

def make_mock_adapter(name: str, output: OutputEnvelope | None = None,
                      raises: Exception | None = None) -> MagicMock:
    """Return a mock ProviderAdapter that either returns an AdapterResult or raises."""
    adapter = MagicMock()
    adapter.name = name
    adapter.default_model = f"{name}-default"
    if raises:
        adapter.run = AsyncMock(side_effect=raises)
    else:
        result = AdapterResult(output=output) if output else None
        adapter.run = AsyncMock(return_value=result)
    return adapter
