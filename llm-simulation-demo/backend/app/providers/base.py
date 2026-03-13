from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Protocol, runtime_checkable

from app.models.request import RunRequest
from app.models.result import OutputEnvelope


class ProviderError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


@runtime_checkable
class ProviderAdapter(Protocol):
    name: str
    default_model: str

    async def run(self, request: RunRequest) -> OutputEnvelope:
        ...


SYSTEM_PROMPT = (
    "You are a support triage assistant. Analyze the customer support ticket "
    "and return a JSON object with exactly these fields:\n"
    "  summary: one sentence describing the core issue\n"
    "  severity: one of low, medium, high, critical\n"
    "  recommended_action: one sentence describing the best next step\n\n"
    "Return ONLY valid JSON. No markdown, no explanation."
)


def build_user_message(request: RunRequest) -> str:
    inp = request.input
    return (
        f"Ticket ID: {inp.ticket_id}\n"
        f"Customer Tier: {inp.customer_tier}\n"
        f"Transcript: {inp.transcript}"
    )
