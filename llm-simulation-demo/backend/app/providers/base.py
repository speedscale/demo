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


# ── Knowledge base articles injected into the analysis prompt ───────────────
# Keyed by the category value returned in the triage step.

KB_ARTICLES: Dict[str, str] = {
    "billing": (
        "KB-1042 — Billing & Refund Procedures\n"
        "Duplicate charges: check payment-service idempotency logs for double-fire events within a 5-minute window. "
        "Common cause is client-side retry without idempotency key. Refund via admin panel → Billing → Issue Credit. "
        "SLA: full refund processed within 5 business days, credit card may take 7-10 days to appear.\n"
        "Disputed invoices: pull usage export from reporting-service. Compare line items against customer's plan entitlements. "
        "Any overage > 20% of expected MRR requires L2 approval before issuing credit.\n"
        "Subscription double-charge: most common after plan upgrade mid-cycle. Prorate logic lives in billing-service/proration.py. "
        "Check audit log for concurrent webhook deliveries from payment processor."
    ),
    "technical": (
        "KB-2001 — Platform Incident Runbook\n"
        "Post-deployment regressions (14:00 UTC daily deploy): check Datadog deployment marker. Compare p99 error rate before/after. "
        "Rollback command: kubectl rollout undo deployment/<service> -n production.\n"
        "Checkout 500 errors: most common causes are (1) tax calculation service timeout, (2) stale session token, "
        "(3) inventory hold race condition. Check order-service logs for CHECKOUT_CONFIRM_FAILED events.\n"
        "Payment processor unavailable: verify stripe.com/status. If processor is healthy, check payment-service circuit breaker "
        "state in Redis (key: cb:payment:state). Circuit may have tripped; reset with admin CLI: platform cb reset payment.\n"
        "Auth failures post-cert-rotation: SAML certificate fingerprints are cached in auth-service for 1 hour. "
        "Force refresh: platform auth clear-cert-cache --tenant <tenant_id>."
    ),
    "integration": (
        "KB-3015 — Webhook & Integration Troubleshooting\n"
        "Silent webhook failures: integration-hub logs all delivery attempts even when customer endpoint returns 2xx. "
        "Check integration_hub.webhook_deliveries table — status='success' with response_code=200 but no payload in body "
        "indicates customer endpoint is swallowing requests. Replay missed events: platform webhooks replay --from <timestamp> --to <timestamp>.\n"
        "API 503 errors: check integration-hub rate limiter. Default: 1000 req/min per tenant. "
        "Enterprise tenants can request quota increase via platform quota increase --tenant <id> --limit <n>.\n"
        "Inventory sync lag: default sync interval is 15 minutes. VIP customers can request 1-minute sync. "
        "Current lag visible at: GET /api/v2/inventory/sync-status. Overselling guard available but opt-in only."
    ),
    "account": (
        "KB-4008 — Account & Authentication\n"
        "SSO / SAML issues: verify IdP metadata URL is accessible. Common issue is IP allowlist on customer firewall blocking "
        "our assertion consumer service at sso.platform.io. Certificate rotation: new cert takes up to 1 hour to propagate "
        "across all auth-service replicas. Immediate fix: platform auth force-reload-cert --tenant <id>.\n"
        "2FA setup loop: known bug in mobile-api-gateway when TOTP verification response arrives > 5s after QR scan. "
        "Workaround: user should complete setup on web, not mobile. Fix in v1.4.0 (next sprint).\n"
        "GDPR erasure: right-to-erasure pipeline runs nightly at 02:00 UTC. Manual trigger available for urgent requests: "
        "platform gdpr erase --user <id> --reason '<legal_request_ref>'. Audit trail preserved for 30 days post-erasure."
    ),
    "performance": (
        "KB-5003 — Performance & Latency Issues\n"
        "Order tracking latency: tracking-service polls carrier APIs every 10 minutes. If no update for 48h, "
        "check carrier_integration.stale_orders table. Manual refresh: platform tracking refresh --order <id>.\n"
        "Mobile app load issues: iOS image compression uses libvips. Bug in v2.3.1 of our iOS SDK causes crash on HEIC images > 1.5MB on iOS 17.4+. "
        "Hotfix SDK v2.3.2 available. Android 14 blank screen: caused by incompatible WebView version in Android System WebView 124. "
        "Fix: force update via Google Play System Update.\n"
        "Report generation timeout: scheduled reports run on reporting-service worker pool (4 workers). "
        "Jobs queued > 30 min indicate worker starvation. Check: platform jobs status --type=report."
    ),
    "data": (
        "KB-6002 — Data Export & Compliance\n"
        "Corrupt CSV exports: known issue when export > 100K rows and request times out at the load balancer (120s default). "
        "Workaround: split into date ranges of 6 months max, or request async export (returns download link via email). "
        "Async export: POST /api/v2/exports with 'async': true.\n"
        "GDPR Article 17 (right to erasure): 30-day legal window, but internal SLA is 15 days. Urgent requests can be manually "
        "triggered. All data deletion is soft-delete for 7 days before hard delete runs.\n"
        "Webhook event replay for audit: available for 90 days. Beyond that requires data warehouse query."
    ),
    "shipping": (
        "KB-7001 — Order & Shipping Issues\n"
        "Bulk import stuck: CSV import pipeline uses async job queue (Redis-backed). Max job size: 10K rows. "
        "Jobs > 10K rows are automatically split. If job shows 'queued' for > 30 min, likely a worker crash. "
        "Check: platform jobs status --id <job_id>. Restart worker: kubectl rollout restart deployment/import-worker.\n"
        "SSL certificate expiry: certificates are managed via Let's Encrypt with auto-renewal 30 days before expiry. "
        "Renewal failure notification should have gone to the account's technical contact. "
        "Emergency reissue: platform ssl reissue --domain <domain>. Takes 2-5 minutes.\n"
        "Order confirmation emails: sent by notification-service. Check delivery status in SendGrid dashboard. "
        "Bulk import jobs trigger batch notifications after job completion, not per-order."
    ),
    "mobile": (
        "KB-8001 — Mobile Application Issues\n"
        "iOS crash on image upload: affects iOS 17.4 with images > 2MB. Root cause: libvips 8.14.x memory alignment bug. "
        "Fixed in SDK v2.3.2. Push update immediately or advise customer to reduce image size < 2MB as workaround.\n"
        "Android 14 blank screen on startup: WebView compatibility issue with Android System WebView 124. "
        "Affects ~30% of Android 14 devices. Fix: advise users to update Android System WebView from Play Store. "
        "Our app update v3.1.1 includes a WebView version check and fallback.\n"
        "Push notification failures: notification-service uses FCM for Android, APNs for iOS. "
        "Check certificate expiry for APNs (yearly). FCM keys rotate quarterly — verify in firebase console."
    ),
    "other": (
        "KB-9000 — General Escalation Procedures\n"
        "L1 to L2 escalation: use Jira 'Escalate to Engineering' workflow. Include ticket ID, customer tier, "
        "reproduction steps, and relevant log snippets. L2 SLA: 2h for critical/VIP, 4h for enterprise, 24h for standard.\n"
        "Customer compensation: standard = account credit up to $50; enterprise = up to $500 or 1-month subscription credit; "
        "VIP = coordinated with CSM, no hard limit, requires VP approval > $1000.\n"
        "Post-incident review: required for all critical tickets. PIR template in Confluence."
    ),
}


def get_kb_article(category: str) -> str:
    """Return the most relevant KB article for a ticket category."""
    return KB_ARTICLES.get(category.lower(), KB_ARTICLES["other"])


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
    category = triage.get("category", "other")
    kb_article = get_kb_article(category)
    return (
        f"Ticket ID: {inp.ticket_id}\n"
        f"Customer Tier: {inp.customer_tier}\n"
        f"Ticket Content:\n{inp.transcript}\n\n"
        f"Initial Triage Result:\n{triage_str}\n\n"
        f"Supporting Data from Platform Tools:\n{context if context else 'No tool data available.'}\n\n"
        f"Relevant Knowledge Base Article:\n{kb_article}"
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
