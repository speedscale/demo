"""
Tools Service — internal microservice for the LLM Ticket Triage demo.

Provides two REST APIs that the backend calls as part of ticket analysis:
  GET /tools/order/{order_id}   — order details for a customer ticket
  GET /tools/policy/{policy_id} — company policy document

This is a *real separate service* (not a local router stub) so that
Speedscale captures backend → tools-service as a distinct network hop
that can be mocked independently during simulation.
"""
from __future__ import annotations

import asyncio
import random

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(
    title="Tools Service",
    description="Order and policy lookup microservice for the ticket triage demo.",
    version="1.4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Realistic order records keyed by ticket ID.
# Each reflects the scenario described in the ticket transcript.
# ---------------------------------------------------------------------------
_ORDERS: dict[str, dict] = {
    "INC-4201": {
        "order_id": "ORD-8821",
        "ticket_id": "INC-4201",
        "status": "checkout_blocked",
        "customer": "Apex Retail Solutions",
        "account_tier": "enterprise",
        "items": ["Inventory Management Suite x12", "Analytics Add-on x12"],
        "order_value_usd": 47230.00,
        "shipping_address": "400 Commerce Blvd, Austin TX 78701",
        "created_at": "2026-03-18T09:14:00Z",
        "notes": "Q4 inventory restock — time-sensitive, customer blocked at checkout for 6 hours",
    },
    "INC-4202": {
        "order_id": "ORD-9102",
        "ticket_id": "INC-4202",
        "status": "payment_failed",
        "customer": "Jane Smith",
        "account_tier": "standard",
        "items": ["Pro Plan Monthly"],
        "order_value_usd": 89.99,
        "shipping_address": "N/A (digital)",
        "created_at": "2026-03-18T14:03:00Z",
        "notes": "Payment failure started at 14:02 UTC — aligns with deployment window",
    },
    "INC-4203": {
        "order_id": "ORD-7745",
        "ticket_id": "INC-4203",
        "status": "shipped_tracking_unavailable",
        "customer": "Morrison Logistics Group",
        "account_tier": "vip",
        "items": ["Mixed SKU pallet x200+"],
        "order_value_usd": 12450.00,
        "shipped_at": "2026-03-17T06:00:00Z",
        "estimated_delivery": "2026-03-20",
        "notes": "200+ daily orders — tracking data missing for last 48 hours",
    },
    "INC-4204": {
        "order_id": "ORD-5566",
        "ticket_id": "INC-4204",
        "status": "duplicate_charge",
        "customer": "Carlos Mendez",
        "account_tier": "standard",
        "items": ["Business Plan Annual"],
        "order_value_usd": 299.00,
        "duplicate_charge_usd": 299.00,
        "charge_timestamps": ["2026-03-01T03:14:00Z", "2026-03-01T03:16:00Z"],
        "notes": "Double billing — both charges confirmed on statement",
    },
    "INC-4205": {
        "order_id": "ORD-6630",
        "ticket_id": "INC-4205",
        "status": "shipped",
        "customer": "Pacific Field Services",
        "account_tier": "enterprise",
        "items": ["Enterprise Mobile License x45"],
        "order_value_usd": 3200.00,
        "device_info": "iOS 17.4",
        "notes": "Mobile crash on photo upload — blocks 45-user field team",
    },
    "INC-4206": {
        "order_id": "ORD-API-0041",
        "ticket_id": "INC-4206",
        "status": "service_degraded",
        "customer": "StreamSync Technologies",
        "account_tier": "vip",
        "items": ["API Integration Plan — 10M calls/mo"],
        "monthly_value_usd": 8900.00,
        "sla_penalty_per_minute_usd": 200.00,
        "outage_start": "2026-03-18T11:00:00Z",
        "backlog_events": 15000,
        "notes": "API 503 for 3 hours — $36,000+ SLA penalties accumulating",
    },
    "INC-4207": {
        "order_id": "ORD-BULK-2207",
        "ticket_id": "INC-4207",
        "status": "import_stalled",
        "customer": "Holiday Goods Co.",
        "account_tier": "enterprise",
        "items": ["Bulk order import — 8,500 rows"],
        "order_value_usd": 234000.00,
        "import_started_at": "2026-03-18T08:00:00Z",
        "rows_processed": 0,
        "rows_total": 8500,
        "notes": "Holiday campaign launch blocked — 0% progress for 6 hours",
    },
    "INC-4208": {
        "order_id": "ORD-9340",
        "ticket_id": "INC-4208",
        "status": "pending_activation",
        "customer": "Maria Gonzalez",
        "account_tier": "standard",
        "items": ["Starter Plan"],
        "order_value_usd": 45.00,
        "notes": "New signup — cannot activate account; no password reset email received",
    },
    "INC-4209": {
        "order_id": "ORD-INV-0092",
        "ticket_id": "INC-4209",
        "status": "oversold",
        "customer": "Zenith Retail Partners",
        "account_tier": "vip",
        "items": ["Limited Edition SKU-LE001 x340 (oversold — only 200 in stock)"],
        "order_value_usd": 67200.00,
        "units_oversold": 140,
        "sync_lag_minutes": 45,
        "notes": "Inventory sync lag caused 140 unfulfillable orders — chargeback risk",
    },
    "INC-4210": {
        "order_id": "ORD-GDPR-0015",
        "ticket_id": "INC-4210",
        "status": "erasure_pending",
        "customer": "DataSubject EU",
        "account_tier": "enterprise",
        "items": ["N/A — GDPR erasure request"],
        "order_value_usd": 0.00,
        "request_submitted_at": "2026-03-03T10:00:00Z",
        "days_outstanding": 15,
        "regulatory_deadline_days": 30,
        "notes": "GDPR Article 17 erasure — 15/30 days elapsed, audit next week",
    },
    "INC-4211": {
        "order_id": "ORD-8871",
        "ticket_id": "INC-4211",
        "status": "active",
        "customer": "Oliver Chen",
        "account_tier": "standard",
        "items": ["E-commerce Starter Plan"],
        "order_value_usd": 120.00,
        "notes": "Product images broken in Chrome 123 — storefront impacted",
    },
    "INC-4212": {
        "order_id": "INV-MAR-2026-0041",
        "ticket_id": "INC-4212",
        "status": "invoice_disputed",
        "customer": "Cascade Digital Group",
        "account_tier": "enterprise",
        "items": ["Platform Fee", "API Overage x9,200 calls (unrecognized)"],
        "billed_usd": 12400.00,
        "expected_usd": 3200.00,
        "dispute_amount_usd": 9200.00,
        "notes": "Invoice $9,200 over expected — unrecognized API call line items",
    },
    "INC-4213": {
        "order_id": "ORD-SSO-0500",
        "ticket_id": "INC-4213",
        "status": "auth_outage",
        "customer": "NorthWest Financial",
        "account_tier": "vip",
        "items": ["Enterprise SSO — 500 seats"],
        "monthly_value_usd": 18000.00,
        "affected_users": 500,
        "lockout_start": "2026-03-18T08:30:00Z",
        "notes": "SAML cert rotation broke SSO — 500 users locked out, board meeting in 4h",
    },
    "INC-4214": {
        "order_id": "REF-88921",
        "ticket_id": "INC-4214",
        "status": "refund_unprocessed",
        "customer": "Sarah Kim",
        "account_tier": "standard",
        "items": ["Winter Jacket — returned"],
        "refund_amount_usd": 156.00,
        "refund_initiated_at": "2026-03-10T14:00:00Z",
        "days_outstanding": 8,
        "notes": "Refund processed 8 days ago — no credit on card, chargeback risk",
    },
    "INC-4215": {
        "order_id": "ORD-WHK-0312",
        "ticket_id": "INC-4215",
        "status": "data_integrity_issue",
        "customer": "FlowLogic Systems",
        "account_tier": "enterprise",
        "items": ["Webhook Integration — 50k events/day"],
        "monthly_value_usd": 5400.00,
        "missed_events": 2800,
        "silent_failure_days": 4,
        "notes": "2,800 missed order events — dashboard shows success but no delivery",
    },
    "INC-4216": {
        "order_id": "ORD-MOB-7721",
        "ticket_id": "INC-4216",
        "status": "app_broken",
        "customer": "Thomas Walker",
        "account_tier": "standard",
        "items": ["Mobile App Subscription"],
        "order_value_usd": 34.99,
        "device_info": "Android 14",
        "notes": "App stuck on loading screen after yesterday's update — 30% of mobile users affected",
    },
    "INC-4217": {
        "order_id": "ORD-DOM-0088",
        "ticket_id": "INC-4217",
        "status": "ssl_expired_outage",
        "customer": "LuxBrand Direct",
        "account_tier": "vip",
        "items": ["Custom Domain + SSL — shop.luxbrand.com"],
        "monthly_revenue_at_risk_usd": 2800.00,
        "revenue_lost_per_hour_usd": 3000.00,
        "ssl_expired_at": "2026-03-18T10:00:00Z",
        "previous_warning_ignored": True,
        "notes": "SSL expired 2h ago — complete storefront outage, $3k/hour revenue loss",
    },
    "INC-4218": {
        "order_id": "ORD-RPT-0220",
        "ticket_id": "INC-4218",
        "status": "reports_missing",
        "customer": "BlueSky Analytics Corp",
        "account_tier": "enterprise",
        "items": ["Business Intelligence Suite — weekly reports"],
        "monthly_value_usd": 4500.00,
        "last_successful_run": "2026-03-16T06:00:00Z",
        "missed_runs": 2,
        "notes": "2 missed executive report runs — no error notifications sent",
    },
    "INC-4219": {
        "order_id": "ORD-SEC-1190",
        "ticket_id": "INC-4219",
        "status": "setup_loop",
        "customer": "David Park",
        "account_tier": "standard",
        "items": ["Starter Plan — 2FA required by employer"],
        "order_value_usd": 29.99,
        "notes": "2FA setup loop — QR code accepted but 2FA remains unconfigured",
    },
    "INC-4220": {
        "order_id": "ORD-EXP-0044",
        "ticket_id": "INC-4220",
        "status": "export_corrupted",
        "customer": "Meridian Healthcare",
        "account_tier": "vip",
        "items": ["Compliance Data Export — 24 months, ~180k rows"],
        "monthly_value_usd": 15000.00,
        "expected_rows": 180000,
        "exported_rows": 3,
        "audit_date": "2026-03-21",
        "notes": "Corrupted CSV export — auditors arrive Thursday, 180k rows showing as 3",
    },
}

# ---------------------------------------------------------------------------
# Policy documents
# ---------------------------------------------------------------------------
_POLICIES: dict[str, dict] = {
    "return-policy-v2": {
        "policy_id": "return-policy-v2",
        "name": "30-Day Return Policy",
        "version": "2.1",
        "eligible_window_days": 30,
        "conditions": "Item must be unused, in original packaging, with receipt.",
        "refund_method": "Original payment method within 5-10 business days.",
        "exceptions": "Digital subscriptions, custom orders, and API credits are non-refundable.",
        "escalation": "Refunds over $500 require manager approval.",
    },
    "enterprise-sla-v1": {
        "policy_id": "enterprise-sla-v1",
        "name": "Enterprise Service Level Agreement",
        "version": "1.4",
        "response_time_hours": 4,
        "resolution_time_hours": 8,
        "uptime_guarantee_pct": 99.9,
        "penalty_per_hour_pct": 5.0,
        "escalation_path": "L1 Support → L2 Engineering → L3 Platform → VP Engineering",
        "dedicated_csm": True,
        "quarterly_review": True,
    },
    "vip-sla-v2": {
        "policy_id": "vip-sla-v2",
        "name": "VIP Service Level Agreement",
        "version": "2.0",
        "response_time_hours": 2,
        "resolution_time_hours": 4,
        "uptime_guarantee_pct": 99.95,
        "penalty_per_hour_pct": 10.0,
        "dedicated_csm": True,
        "dedicated_engineering_contact": True,
        "escalation_path": "Dedicated CSM → CTO",
    },
    "data-privacy-v3": {
        "policy_id": "data-privacy-v3",
        "name": "Data Privacy & GDPR Policy",
        "version": "3.0",
        "gdpr_erasure_window_days": 30,
        "internal_target_days": 15,
        "data_retention_years": 7,
        "right_to_access": True,
        "right_to_erasure": True,
        "dpa_contact": "dpa@techcorp.com",
        "notes": "GDPR Article 17 requests must be completed within 30 days; internal SLA is 15 days.",
    },
    "refund-policy-v1": {
        "policy_id": "refund-policy-v1",
        "name": "Subscription Refund Policy",
        "version": "1.2",
        "refund_window_days": 7,
        "duplicate_charge_auto_refund": True,
        "processing_time_business_days": 5,
        "chargeback_fee_usd": 15.00,
        "notes": "Duplicate charges are automatically refunded within 2 business days.",
    },
}

_DEFAULT_POLICY = {
    "policy_id": "standard-policy-v1",
    "name": "Standard Support Policy",
    "version": "1.0",
    "response_time_hours": 24,
    "eligible": True,
    "conditions": "Standard terms apply. Contact support for details.",
}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/tools/order/{order_id}")
async def lookup_order(order_id: str):
    """Look up order/account details by ticket ID or order ID.

    Simulates a real database query: 80–220 ms including index scan,
    customer account join, and order-line hydration.
    """
    await asyncio.sleep(random.uniform(0.08, 0.22))
    record = _ORDERS.get(order_id)
    if record:
        return JSONResponse(record)
    # Fallback for unknown IDs
    return JSONResponse({
        "order_id": f"ORD-{order_id[-4:]}",
        "ticket_id": order_id,
        "status": "active",
        "customer": "Unknown Customer",
        "account_tier": "standard",
        "items": ["Standard Plan"],
        "order_value_usd": 49.99,
        "notes": "No specific order record found for this ticket ID.",
    })


@app.get("/tools/policy/{policy_id}")
async def lookup_policy(policy_id: str):
    """Look up a company policy document by ID.

    Simulates a cache-backed policy fetch: 15–60 ms
    (cache hit most of the time, occasional cold read).
    """
    await asyncio.sleep(random.uniform(0.015, 0.06))
    record = _POLICIES.get(policy_id, _DEFAULT_POLICY)
    return JSONResponse(record)
