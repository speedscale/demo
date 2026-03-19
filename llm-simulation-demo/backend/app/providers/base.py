from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Dict, List, Protocol, Tuple, runtime_checkable

from app.models.request import RunRequest
from app.models.result import LLMStep, OutputEnvelope


class ProviderError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


@dataclass
class AdapterResult:
    output: OutputEnvelope
    steps: List[LLMStep] = field(default_factory=list)
    total_tokens: int = 0
    cost_usd: float = 0.0


@runtime_checkable
class ProviderAdapter(Protocol):
    name: str
    default_model: str

    async def run(self, request: RunRequest, context: str = "") -> AdapterResult:
        ...


# Per-model pricing in USD per 1M tokens (input_price, output_price)
MODEL_PRICING: Dict[str, Tuple[float, float]] = {
    # OpenAI
    "gpt-4.1-mini":             (0.40,   1.60),
    "gpt-4.1":                  (2.00,   8.00),
    "gpt-4o-mini":              (0.15,   0.60),
    # Anthropic
    "claude-haiku-4-5":         (0.80,   4.00),
    "claude-sonnet-4-5":        (3.00,  15.00),
    "claude-opus-4-5":          (15.00, 75.00),
    # Gemini
    "gemini-flash-latest":      (0.10,   0.40),
    "gemini-flash-lite-latest": (0.075,  0.30),
    "gemini-pro-latest":        (1.25,   5.00),
    # xAI / Grok
    "grok-3":                   (3.00,  15.00),
    "grok-3-mini":              (0.30,   0.50),
    "grok-2-1212":              (2.00,  10.00),
}


def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calculate cost in USD for a single LLM call."""
    pricing = MODEL_PRICING.get(model, (1.00, 5.00))
    input_cost = prompt_tokens * pricing[0] / 1_000_000
    output_cost = completion_tokens * pricing[1] / 1_000_000
    return round(input_cost + output_cost, 8)


# ── System prompts ──────────────────────────────────────────────────────────

SYSTEM_PROMPT_TRIAGE = (
    "You are an expert support ticket classifier for a SaaS e-commerce platform.\n"
    "Analyze the support ticket and classify it.\n\n"
    "Platform context: multi-tenant e-commerce platform with payment processing, order management,\n"
    "inventory, subscriptions, mobile apps (iOS/Android), and third-party integrations.\n"
    "Customer tiers: standard (24h SLA), enterprise (4h SLA), vip (2h SLA with dedicated CSM).\n\n"
    "Return ONLY valid JSON with exactly these fields:\n"
    '  "severity": one of low | medium | high | critical\n'
    '  "category": one of billing | technical | shipping | account | performance | data | integration | mobile | other\n'
    '  "urgency_score": integer 1-10 (10 = most urgent, requires immediate action)\n'
    '  "escalation_required": boolean\n'
    '  "affected_component": brief description of the affected system or feature (max 10 words)\n'
    '  "customer_sentiment": one of frustrated | neutral | angry | urgent\n\n'
    "Return ONLY valid JSON. No markdown fences, no explanation."
)

SYSTEM_PROMPT_ANALYSIS = (
    "You are a senior technical support analyst. Given the support ticket, its initial triage,\n"
    "customer order data, and platform policy information, perform a deep root cause analysis.\n\n"
    "Platform context: microservices architecture with these services:\n"
    "  payment-service, order-service, inventory-service, notification-service,\n"
    "  auth-service, mobile-api-gateway, integration-hub, reporting-service.\n"
    "Deployment cadence: daily at 14:00 UTC. Treat post-14:00 UTC issues as potentially deployment-related.\n"
    "Escalation path: L1 Support (0-2h) → L2 Engineering (2-4h) → L3 Platform Team → VP Engineering.\n"
    "SLA: enterprise = 4h resolution, vip = 2h resolution, standard = 24h.\n\n"
    "Return ONLY valid JSON with exactly these fields:\n"
    '  "root_cause": likely root cause with technical detail (2-3 sentences)\n'
    '  "customer_impact": business and operational impact on the customer (1-2 sentences)\n'
    '  "affected_systems": array of affected service/component names (3-5 items)\n'
    '  "estimated_resolution_time": human-readable estimate (e.g. "2-4 hours")\n'
    '  "investigation_steps": array of 4-5 concrete investigation steps for the engineering team\n'
    '  "summary": one sentence describing the core issue\n\n'
    "Return ONLY valid JSON. No markdown fences, no explanation."
)

SYSTEM_PROMPT_RESPONSE = (
    "You are a customer success manager drafting support responses. You are professional,\n"
    "empathetic, solution-focused, and adapt your tone to the customer's tier and sentiment.\n\n"
    "Company: TechCorp Platform. Response guidelines:\n"
    "  - Enterprise/VIP: personalized greeting, named CSM owner, offer 15-min call, detailed steps\n"
    "  - Standard: helpful and concise, link to self-service knowledge base\n"
    "  - Always acknowledge the inconvenience and validate frustration\n"
    "  - Provide a concrete timeline and numbered next steps\n"
    "  - Include the ticket reference number in the subject\n"
    "  - Never over-promise; if unsure of ETA say 'our team is actively investigating'\n\n"
    "Return ONLY valid JSON with exactly these fields:\n"
    '  "subject_line": email subject line (include ticket ID, keep under 60 chars)\n'
    '  "response_body": full customer-facing response (3-4 paragraphs with numbered steps where helpful)\n'
    '  "recommended_action": the single most important next step for the support agent (1 sentence)\n'
    '  "follow_up_required": boolean\n'
    '  "internal_notes": brief notes for the support team that are NOT sent to the customer\n\n'
    "Return ONLY valid JSON. No markdown fences, no explanation."
)


# ── Message builders ────────────────────────────────────────────────────────

def build_triage_message(request: RunRequest) -> str:
    inp = request.input
    return (
        f"Ticket ID: {inp.ticket_id}\n"
        f"Customer Tier: {inp.customer_tier}\n"
        f"Ticket Content:\n{inp.transcript}"
    )


def build_analysis_message(request: RunRequest, triage: dict, context: str) -> str:
    inp = request.input
    triage_str = json.dumps(triage, indent=2)
    return (
        f"Ticket ID: {inp.ticket_id}\n"
        f"Customer Tier: {inp.customer_tier}\n"
        f"Ticket Content:\n{inp.transcript}\n\n"
        f"Initial Triage Result:\n{triage_str}\n\n"
        f"Supporting Data from Platform Tools:\n{context if context else 'No tool data available.'}"
    )


def build_response_message(request: RunRequest, triage: dict, analysis: dict) -> str:
    inp = request.input
    triage_str = json.dumps(triage, indent=2)
    analysis_str = json.dumps(analysis, indent=2)
    return (
        f"Ticket ID: {inp.ticket_id}\n"
        f"Customer Tier: {inp.customer_tier}\n"
        f"Ticket Content:\n{inp.transcript}\n\n"
        f"Triage Classification:\n{triage_str}\n\n"
        f"Root Cause Analysis:\n{analysis_str}"
    )


def _safe_json(raw: str, default: dict) -> dict:
    try:
        return json.loads(raw)
    except Exception:
        return default
