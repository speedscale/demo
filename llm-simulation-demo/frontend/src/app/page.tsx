"use client";

import { useState, useEffect } from "react";
import { runTask, getProviders } from "@/lib/api";
import type { ProviderInfo, RunResult } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";

// ── 20 sample tickets ───────────────────────────────────────────────────────
const SAMPLE_TICKETS = [
  {
    id: "INC-4201",
    tier: "enterprise",
    transcript:
      "[Customer — Initial report, 09:14 UTC]\nWe cannot complete checkout since this morning. Every attempt hits a 500 error on /checkout/confirm after we updated our shipping address. This is blocking $47,000 in Q4 inventory restock orders across all 12 users in our org.\n\n[L1 Agent — 09:31 UTC]\nThank you for reaching out. Can you confirm when the address change was made and whether this affects all product types or only specific SKUs?\n\n[Customer — 09:45 UTC]\nAddress was updated yesterday at ~18:00 UTC. Affects every SKU, every user. Error appears after the tax recalculation step. Here's the stack trace from our browser console: TypeError: Cannot read property 'total' of undefined at checkout.js:441. We've had no ability to place orders for 6 hours now. Q4 campaign launches tomorrow.",
  },
  {
    id: "INC-4202",
    tier: "standard",
    transcript:
      "[Customer — Initial report, 14:18 UTC]\nAll payment methods are being declined since about 14:02 UTC today. We tried Visa, Mastercard, and PayPal. All fail with the message 'payment processor unavailable' but no further detail.\n\n[L1 Agent — 14:35 UTC]\nWe see the deploy went out at 14:00 UTC today. Are you seeing this for all customers or just specific accounts?\n\n[Customer — 14:41 UTC]\nAll customers, all payment methods. We've had zero successful transactions in the past 40 minutes. Our own logs show the payment-service returning 503 starting at exactly 14:02. We process roughly $8,000/hour so this is significant lost revenue. The error message shown to customers gives them no actionable information, which is making them think their cards are the problem.",
  },
  {
    id: "INC-4203",
    tier: "vip",
    transcript:
      "[Customer — Initial report, 07:22 UTC]\nOrder tracking page is blank for all orders placed in the last 48 hours. Our warehouse team manages 200+ shipments daily and is completely blind right now.\n\n[L1 Agent — 07:38 UTC]\nSorry for the disruption. Can you confirm whether this is the web portal, mobile app, or both? And are older orders (pre-48h) showing correctly?\n\n[Customer — 07:52 UTC]\nBoth web and mobile. Orders older than 48 hours show fine. We've confirmed with three different carrier integrations (FedEx, UPS, DHL) and none have changed on their end. We're now considering reverting to manual tracking spreadsheets which will consume 8 staff hours per day. We have a major retailer client who receives automated tracking updates from us — if they notice the delay we risk losing a $400K annual contract. This is our second major outage this quarter.",
  },
  {
    id: "INC-4204",
    tier: "standard",
    transcript:
      "[Customer — Initial report, 08:05 UTC]\nMy credit card was charged twice for my March subscription renewal — two identical charges of $299 on March 1st at 03:14 and 03:16 UTC.\n\n[L1 Agent — 08:20 UTC]\nWe're sorry to hear that. I can see two transactions in our system. Can you share your bank statement reference numbers so we can cross-reference with our payment processor?\n\n[Customer — 08:34 UTC]\nBank references: TXN-884421 and TXN-884423. Both show as posted. My bank says both already cleared so a standard decline/retry scenario doesn't apply here — these were two separate successful charges 2 minutes apart. I've been a customer for 3 years and this is the first billing issue. I want the duplicate refunded and a written explanation of what happened so I can verify my other charges weren't affected. If this isn't resolved today I'll dispute both charges.",
  },
  {
    id: "INC-4205",
    tier: "enterprise",
    transcript:
      "[Customer — Initial report, 11:30 UTC]\nOur iOS app crashes immediately when field technicians try to upload profile photos larger than 2MB on iOS 17.4. 100% reproducible. Android works fine.\n\n[L1 Agent — 11:48 UTC]\nThank you for the details. Have you seen any crash logs or error codes? And when did this start — after an OS update or app update?\n\n[Customer — 12:02 UTC]\nStarted after iOS updated to 17.4 last week. Crash log shows: SIGSEGV in libvips image compression module at address 0x00000001042d8f40. We have 47 field technicians who cannot update their profiles, which is required before client site visits per our company policy. We have a major client presentation tomorrow at 09:00 UTC where all reps must have current profile photos visible in the app. If this isn't resolved by end of day today we're escalating to your account VP. We've already had to postpone two site visits today.",
  },
  {
    id: "INC-4206",
    tier: "vip",
    transcript:
      "[Customer — Initial report, 15:03 UTC]\nAll API endpoints returning HTTP 503 for the past 3 hours. We're a real-time inventory management system — our downstream clients are accumulating unprocessed events.\n\n[L1 Agent — 15:19 UTC]\nWe're investigating. Can you provide your API client ID and example request IDs that are failing?\n\n[Customer — 15:27 UTC]\nClient ID: api_8841-vipenterprise. Sample failing request IDs: req_4481992, req_4482103, req_4482215. Backlog is now at 15,000 unprocessed events and growing at ~90/minute. Our SLA with our own customers requires < 5 minute event processing time. We're already 3 hours in violation. Each minute of delay costs approximately $200 in SLA penalties we owe downstream. We've already paid out $36,000 in penalties today. We need an incident commander assigned to this immediately and an ETA within 15 minutes or our CTO is calling your CEO.",
  },
  {
    id: "INC-4207",
    tier: "enterprise",
    transcript:
      "[Customer — Initial report, 08:47 UTC]\nBulk order import stuck at 0% for 6 hours. Uploaded 8,500-row CSV for our holiday campaign at 02:30 UTC. Job ID: IMPORT-882941.\n\n[L1 Agent — 09:05 UTC]\nWe can see job IMPORT-882941 in a 'queued' state. Can you confirm the file format and whether you've used bulk import successfully before?\n\n[Customer — 09:18 UTC]\nSame CSV template we've used for 2 years. Last successful import was November 12th. This is our biggest campaign of the year — orders were supposed to start processing at 06:00 UTC. Customers are now receiving no order confirmation emails, which is generating inbound customer service tickets for us. We have a promotional email going out at noon today to 45,000 subscribers about this campaign. If orders aren't processing by then we'll have to cancel the promotion entirely and lose the marketing spend. We need this escalated immediately.",
  },
  {
    id: "INC-4208",
    tier: "standard",
    transcript:
      "[Customer — Initial report, 10:11 UTC]\nPassword reset emails not arriving. Tested with 5 addresses — Gmail, Outlook, Yahoo. Checked spam. Nothing.\n\n[L1 Agent — 10:28 UTC]\nWe're checking our email delivery logs. Can you confirm the account email addresses and approximate times you requested resets?\n\n[Customer — 10:44 UTC]\nAddresses: test1@gmail.com, test2@outlook.com, test3@yahoo.com, and two work domains. Reset requests at 09:50, 10:05, 10:15, 10:22, 10:40 UTC — all today. This has been ongoing for at least 2 days based on customer complaints we've received. We launched a new product last week and have ~200 new signups who cannot access their accounts. Our NPS survey is already showing negative comments about onboarding. We're losing customers before they even complete setup.",
  },
  {
    id: "INC-4209",
    tier: "vip",
    transcript:
      "[Customer — Initial report, 13:30 UTC]\nInventory sync is showing a 45-minute lag. We've already oversold 340 units of a limited-edition SKU (product ID: SKU-LMTD-2891) that we only have 200 units of.\n\n[L1 Agent — 13:45 UTC]\nWe're looking into the sync delay. Can you confirm your current sync configuration and when this lag started?\n\n[Customer — 14:02 UTC]\nSync was configured for 15-minute intervals. Lag started around 11:00 UTC today. The 340 oversold orders are from real customers — we can't just cancel them without serious brand damage. We need: (1) sync interval reduced to under 5 minutes immediately, (2) an automated inventory lock to prevent further overselling while we assess, and (3) a root cause explanation we can share with affected customers. We're calculating $28,000 in potential chargebacks if we can't fulfill. This is the third sync issue in 6 months. We're evaluating alternative platforms.",
  },
  {
    id: "INC-4210",
    tier: "enterprise",
    transcript:
      "[Customer — Initial report, 16:20 UTC]\nGDPR Article 17 erasure request submitted 15 days ago has not been processed. Customer data still visible in admin panel. User ID: USR-449821.\n\n[L1 Agent — 16:35 UTC]\nWe take GDPR compliance very seriously. Can you provide the original erasure request reference number?\n\n[Customer — 16:48 UTC]\nRequest reference: GDPR-2024-1142. Submitted October 15th. Our DPO requires erasure within 15 days to maintain compliance margin before the 30-day legal deadline. We have a regulatory audit scheduled next Monday and this open erasure request will be a direct finding. If the audit results in an enforcement action due to platform non-compliance, we will be seeking damages. Additionally, the data subject is a former employee with access to sensitive financial records — every additional day of exposure increases our risk. We need confirmation of erasure within 4 hours or our legal team will file a formal complaint with the ICO.",
  },
  {
    id: "INC-4211",
    tier: "standard",
    transcript:
      "[Customer — Initial report, 09:33 UTC]\nProduct images broken on our storefront in Chrome 123 on Windows. Showing alt text only. Firefox and Safari fine.\n\n[L1 Agent — 09:50 UTC]\nThank you for the report. Is this affecting all product images or specific categories? Any recent changes to your store configuration?\n\n[Customer — 10:04 UTC]\nAll product images, all categories, no config changes. Started approximately 3 days ago. We confirmed it on multiple Chrome 123 Windows machines but Chrome on macOS is also fine. Mobile Chrome (Android and iOS) shows images correctly — only desktop Windows Chrome is affected. We've had a 23% drop in conversion rate on Windows devices this week, which correlates exactly with when this started. We're currently running a paid ad campaign targeting Windows users, so we're paying for traffic that sees a broken storefront.",
  },
  {
    id: "INC-4212",
    tier: "enterprise",
    transcript:
      "[Customer — Initial report, 11:15 UTC]\nMarch invoice shows $12,400 in charges. Our normal bill is ~$3,200. The extra $9,200 appears as API overage for endpoints we don't use.\n\n[L1 Agent — 11:32 UTC]\nWe're pulling up your invoice details. Can you specify which line items look incorrect and your account ID?\n\n[Customer — 11:50 UTC]\nAccount: ENT-88421. The unknown line items are: 'Advanced Analytics API — 2.8M calls: $4,200', 'Real-time Sync API — 1.2M calls: $3,100', and 'Custom Webhook Premium — $1,900'. We don't use any of these features — we're on the Standard Enterprise plan which doesn't include them. This looks like either a billing system error or our account was used for API calls we didn't make, which would be a security concern. Our accounts payable deadline is this Friday. If this isn't resolved with a corrected invoice by Thursday, our CFO will instruct us to withhold payment entirely and engage our legal team.",
  },
  {
    id: "INC-4213",
    tier: "vip",
    transcript:
      "[Customer — Initial report, 08:02 UTC]\nSAML SSO broken for all 500 users since 07:15 UTC when we rotated our IdP certificate. Error: 'SAML assertion signature validation failed'.\n\n[L1 Agent — 08:14 UTC]\nWe see the certificate rotation in our logs. Our system may be caching the old certificate fingerprint. Can you provide the new certificate thumbprint?\n\n[Customer — 08:22 UTC]\nNew cert thumbprint: 4A:B2:C8:D1:E5:F3:... (full fingerprint in attached file). Entire company is locked out — 500 users cannot log in. We're in end-of-month reporting period which is our most critical operational window. Finance team cannot access billing data, operations team cannot see dashboards, and we have a board presentation in 4 hours that requires live platform data. We previously reported a similar issue 3 months ago (ticket INC-3891) that took 6 hours to resolve. We cannot have a repeat. We need an L2 engineer with SAML authority assigned NOW and a 15-minute status update cadence.",
  },
  {
    id: "INC-4214",
    tier: "standard",
    transcript:
      "[Customer — Initial report, 14:05 UTC]\nRefund processed 8 days ago (refund ID: REF-88921, amount $156.00) has not appeared on my card.\n\n[L1 Agent — 14:22 UTC]\nI can confirm refund REF-88921 was processed on our end on the 8th. Processing times vary by bank — typically 5-10 business days.\n\n[Customer — 14:39 UTC]\nI understand typical timelines, but 8 business days have passed. I called my bank (Chase) directly — they confirmed there is no pending credit associated with my account from your company and no record of the refund being initiated by your payment processor. This means either the refund was processed to a different card on file, the refund failed silently on your end, or there's a processor routing error. If I don't see the credit by tomorrow I will file a chargeback, which I understand costs you the transaction fee plus a $15 dispute fee and affects your merchant rating. I'd rather avoid that — can you provide the Stripe refund ID so I can have my bank trace it specifically?",
  },
  {
    id: "INC-4215",
    tier: "enterprise",
    transcript:
      "[Customer — Initial report, 10:55 UTC]\nWebhook deliveries showing as 'success' in your dashboard but our server is receiving nothing. We've missed 2,800 events over 4 days.\n\n[L1 Agent — 11:12 UTC]\nThat's a serious discrepancy. Can you share your webhook endpoint URL and confirm your server is accessible? Any recent firewall or infrastructure changes?\n\n[Customer — 11:28 UTC]\nEndpoint: https://api.internal.ourplatform.com/webhooks/orders (accessible — verified with external monitoring). No infrastructure changes. Our WAF logs show zero requests from your IP ranges in the past 4 days, but your dashboard claims 2,800 successful deliveries with 200 response codes. This is impossible — if we returned 200, we processed the event. Something in your integration-hub is fabricating success responses. The 2,800 missed events include 840 order completions, 1,200 order updates, and 760 cancellations. Our warehouse OMS is now out of sync with your platform and we don't know which orders to fulfill. This is a data integrity crisis that requires a full event replay and a post-incident explanation of how your system reported false successes.",
  },
  {
    id: "INC-4216",
    tier: "standard",
    transcript:
      "[Customer — Initial report, 09:18 UTC]\nOur mobile app is stuck on loading screen for Android 14 users since the update we pushed yesterday.\n\n[L1 Agent — 09:35 UTC]\nThank you for the report. What version of the app was updated, and are all Android 14 users affected or just some?\n\n[Customer — 09:52 UTC]\nUpdated from v3.0.8 to v3.1.0 yesterday at 16:00 UTC. 100% of Android 14 users affected (approximately 30% of our mobile base — ~4,200 users). Android 13 and below work fine. Force-close, reinstall, cache clear — nothing helps. We've already received 180 support tickets from our own users and our app store rating dropped from 4.3 to 3.9 overnight due to 1-star reviews. We've tried rolling back to v3.0.8 for new downloads but users who updated are stuck. Is there a known compatibility issue with Android 14 in your SDK? We need a hotfix or a rollback mechanism for existing installs.",
  },
  {
    id: "INC-4217",
    tier: "vip",
    transcript:
      "[Customer — Initial report, 11:40 UTC]\nOur custom domain SSL cert expired 2 hours ago. Full storefront outage — browsers showing 'connection not secure'. Revenue loss ~$3,000/hour.\n\n[L1 Agent — 11:55 UTC]\nWe're treating this as a P1. Can you confirm the domain and your account ID so we can initiate emergency reissue?\n\n[Customer — 12:03 UTC]\nDomain: store.brightwave-retail.com. Account: VIP-44182. We reported the upcoming expiration 3 weeks ago via ticket INC-4089 and were told it would be handled automatically. That ticket was marked resolved without any action. We're now 2 hours into a complete outage during peak shopping hours. Lost revenue is approximately $6,000 so far. Our PR team is already seeing social media posts from customers about the 'broken website'. We want: (1) immediate certificate reissue, (2) explanation of why auto-renewal failed, (3) written post-incident report, and (4) SLA credit for the outage duration. If this isn't resolved in the next 30 minutes we're escalating to your CTO.",
  },
  {
    id: "INC-4218",
    tier: "enterprise",
    transcript:
      "[Customer — Initial report, 09:00 UTC]\nAutomated weekly reports failed to run Monday at 06:00 UTC. Job ID: RPT-WEEKLY-4421. Second consecutive missed run.\n\n[L1 Agent — 09:18 UTC]\nWe can see the job in our system. No error was logged, which is unusual. Have you made any changes to report configuration or recipients recently?\n\n[Customer — 09:35 UTC]\nNo configuration changes. Last successful run was Sunday November 10th. This report goes to our C-suite every Monday morning as part of their standing review meeting — it includes revenue, churn, and operational KPIs. The Monday meeting had to be postponed both weeks due to missing data, which reflects poorly on our operations team. We've now manually compiled the data twice, consuming 4 hours of analyst time each time. Additionally, we suspect the root cause may be related to an uptick in data volume — we crossed 50M records last month. If so, we need the report job split or the worker allocated more resources before next Monday.",
  },
  {
    id: "INC-4219",
    tier: "standard",
    transcript:
      "[Customer — Initial report, 13:45 UTC]\n2FA setup looping — scanned QR code, entered verification code, app accepted it but account still shows 2FA as 'not configured'.\n\n[L1 Agent — 14:02 UTC]\nThis sounds like the verification isn't completing the enrollment flow. Which authenticator app are you using, and are you on web or mobile?\n\n[Customer — 14:18 UTC]\nTried Google Authenticator, Authy, and Microsoft Authenticator — same result on all three. Tried both web browser (Chrome, Firefox) and mobile app. The QR code scans fine, the 6-digit code is accepted (no error message), but then redirects back to the setup screen as if no action was taken. This has been broken for at least a week — I know because my company's new security policy requires 2FA enabled by end of this week and I'm one of 15 employees trying to set it up. If we can't enable 2FA, my company's security audit next week will flag us. I need this working today.",
  },
  {
    id: "INC-4220",
    tier: "vip",
    transcript:
      "[Customer — Initial report, 08:30 UTC]\nData export returned a 2KB corrupted CSV instead of the expected ~50MB. Request ID: EXP-884120. Contains only headers and 3 rows out of ~180,000.\n\n[L1 Agent — 08:47 UTC]\nWe're investigating. This may be related to a timeout on large exports. Can you confirm the date range and exact filters you applied?\n\n[Customer — 09:05 UTC]\nFull transaction history, January 2022 to December 2023, no filters. Request ID EXP-884120. We've tried 4 times with the same result. Our external auditors from Deloitte arrive on Thursday for our SOC 2 Type II audit — this transaction data is the primary evidence package. If we cannot produce it, the audit will be paused and rescheduled, at a cost of $45,000 in auditor fees and a 3-month delay to our compliance certification. This certification is required to close a $2M enterprise contract we're finalizing. We need the complete dataset by Wednesday 17:00 UTC at the latest. Please treat this as a business-critical emergency.",
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

// ── Pricing note shown in the savings estimator ─────────────────────────────
const PROVIDER_DISPLAY: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  xai: "xAI / Grok",
};

function fmt$(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

// ── Small UI primitives ─────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 transition-all"
      style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
      {...props}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
      style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
      {...props}
    />
  );
}

function ToolCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
        {title}
      </p>
      <dl className="space-y-1.5">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-sm">
            <dt className="flex-shrink-0 capitalize" style={{ color: "var(--text-muted)" }}>
              {k.replace(/_/g, " ")}:
            </dt>
            <dd className="font-medium truncate">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Single-run result panel ─────────────────────────────────────────────────

function ResultPanel({ result }: { result: RunResult }) {
  const order = result.tool_calls.find((t) => t.name === "lookup_order");
  const policy = result.tool_calls.find((t) => t.name === "lookup_policy");
  const [expanded, setExpanded] = useState(false);

  const severityBg: Record<string, string> = {
    low: "#10b98111",
    medium: "#f59e0b11",
    high: "#f9731611",
    critical: "#ef444411",
  };

  return (
    <div className="space-y-4">
      {/* Header row: severity + cost */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ background: severityBg[result.output.severity] ?? "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <SeverityBadge severity={result.output.severity} />
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono px-2 py-1 rounded-md font-bold" style={{ background: "#10b98122", color: "#10b981", border: "1px solid #10b98133" }}>
              {fmt$(result.cost_usd)} · {result.total_tokens.toLocaleString()} tokens
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{result.request_id}</span>
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Summary</p>
          <p className="text-sm leading-relaxed">{result.output.summary}</p>
        </div>
        {result.output.root_cause && (
          <div>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Root Cause</p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{result.output.root_cause}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl p-5" style={{ background: "#10b98108", border: "1px solid #10b98133" }}>
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "#10b981" }}>Recommended Action</p>
        <p className="text-sm leading-relaxed">{result.output.recommended_action}</p>
      </div>

      {result.output.response_draft && (
        <div className="rounded-xl p-5 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Draft Customer Response</p>
            <button className="text-xs underline" style={{ color: "var(--text-muted)" }} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "collapse" : "expand"}
            </button>
          </div>
          {expanded && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.output.response_draft}</p>
          )}
          {!expanded && (
            <p className="text-sm leading-relaxed line-clamp-2" style={{ color: "var(--text-muted)" }}>{result.output.response_draft}</p>
          )}
        </div>
      )}

      {/* LLM pipeline steps */}
      {result.steps.length > 0 && (
        <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Pipeline Steps ({result.steps.length} LLM calls)</p>
          {result.steps.map((step) => (
            <div key={step.name} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <span className="font-mono capitalize">{step.name}</span>
              <div className="flex gap-4" style={{ color: "var(--text-muted)" }}>
                <span>{(step.prompt_tokens + step.completion_tokens).toLocaleString()} tok</span>
                <span>{step.duration_ms}ms</span>
                <span className="font-semibold" style={{ color: "#10b981" }}>{fmt$(step.cost_usd)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {order?.result ? (
          <ToolCard title="Order Details" data={order.result as Record<string, unknown>} />
        ) : order?.error ? (
          <div className="rounded-lg p-4" style={{ background: "#ef444411", border: "1px solid #ef444433" }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "#ef4444" }}>Order Lookup Failed</p>
            <p className="text-xs">{order.error}</p>
          </div>
        ) : null}
        {policy?.result ? (
          <ToolCard title="Return Policy" data={policy.result as Record<string, unknown>} />
        ) : null}
      </div>

      <div className="flex items-center justify-between text-xs pt-1" style={{ color: "var(--text-muted)" }}>
        <span>{result.provider} · {result.model} · {result.timing.total_ms}ms</span>
        <div className="flex gap-4">
          <a href={`/runs/${result.request_id}`} className="hover:opacity-80 underline">Full trace</a>
          <a href={`/compare?a=${result.request_id}`} className="hover:opacity-80 underline">Compare</a>
        </div>
      </div>
    </div>
  );
}

// ── Batch results ───────────────────────────────────────────────────────────

interface BatchItem {
  ticket: (typeof SAMPLE_TICKETS)[number];
  provider: string;
  status: "pending" | "running" | "done" | "error";
  result?: RunResult;
  error?: string;
}

function SavingsEstimator({ items, runsPerDay }: { items: BatchItem[]; runsPerDay: number }) {
  const completed = items.filter((i) => i.status === "done" && i.result);
  if (completed.length === 0) return null;

  const batchCost = completed.reduce((sum, i) => sum + (i.result?.cost_usd ?? 0), 0);
  const costPerTicket = batchCost / completed.length;
  const dailyCost = costPerTicket * runsPerDay;
  const monthlyCost = dailyCost * 30;
  const annualCost = dailyCost * 365;

  const byProvider: Record<string, { cost: number; count: number }> = {};
  for (const item of completed) {
    if (!item.result) continue;
    const p = item.provider;
    if (!byProvider[p]) byProvider[p] = { cost: 0, count: 0 };
    byProvider[p].cost += item.result.cost_usd;
    byProvider[p].count += 1;
  }

  function fmtLarge(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return fmt$(n);
  }

  const maxAnnualPerProvider = Math.max(
    ...Object.values(byProvider).map((v) => (v.cost / v.count) * runsPerDay * 365),
    0.001
  );

  return (
    <div className="rounded-xl p-5 space-y-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-bold">Cost at Scale</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Projected from live run · {runsPerDay.toLocaleString()} tickets/day
          </p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>
          {fmt$(costPerTicket)} avg / ticket · 3 LLM calls
        </span>
      </div>

      {/* Hero: annual real vs simulation */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4 text-center space-y-1" style={{ background: "#ef444411", border: "1px solid #ef444433" }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: "#ef4444" }}>Annual LLM spend</p>
          <p className="text-3xl font-bold leading-none" style={{ color: "#ef4444" }}>{fmtLarge(annualCost)}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{fmt$(dailyCost)}/day · {fmtLarge(monthlyCost)}/mo</p>
        </div>
        <div className="rounded-xl p-4 text-center space-y-1" style={{ background: "#10b98111", border: "1px solid #10b98133" }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: "#10b981" }}>With simulation</p>
          <p className="text-3xl font-bold leading-none" style={{ color: "#10b981" }}>$0</p>
          <p className="text-xs font-semibold" style={{ color: "#10b981" }}>Save {fmtLarge(annualCost)} / year</p>
        </div>
      </div>

      {/* Per-provider annual breakdown */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Annual spend by provider</p>
        {Object.entries(byProvider)
          .sort((a, b) => b[1].cost / b[1].count - a[1].cost / a[1].count)
          .map(([prov, { cost, count }]) => {
            const perTicket = cost / count;
            const annual = perTicket * runsPerDay * 365;
            return (
              <div key={prov} className="flex items-center gap-3 text-xs">
                <span className="w-24 font-medium">{PROVIDER_DISPLAY[prov] ?? prov}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, (annual / maxAnnualPerProvider) * 100)}%`, background: "var(--accent)" }}
                  />
                </div>
                <span className="w-16 text-right font-mono">{fmt$(perTicket)}/tkt</span>
                <span className="w-20 text-right font-mono font-semibold" style={{ color: "#ef4444" }}>{fmtLarge(annual)}/yr</span>
              </div>
            );
          })}
        <div className="flex items-center gap-3 text-xs">
          <span className="w-24 font-bold" style={{ color: "#10b981" }}>Simulation</span>
          <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--surface2)" }}>
            <div className="h-full w-0.5 rounded-full" style={{ background: "#10b981" }} />
          </div>
          <span className="w-16 text-right font-mono font-bold" style={{ color: "#10b981" }}>$0.00/tkt</span>
          <span className="w-20 text-right font-mono font-bold" style={{ color: "#10b981" }}>$0/yr</span>
        </div>
      </div>

      <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
        <p><strong style={{ color: "var(--text)" }}>How simulation eliminates this cost:</strong></p>
        <p>Speedscale captures the exact traffic pattern from this run — real tickets, real LLM responses — and replays it at any scale without calling the API. Your support pipeline gets realistic responses in testing and load scenarios for $0.</p>
      </div>
    </div>
  );
}

function BatchResultsPanel({
  items,
  done,
  total,
  runsPerDay,
}: {
  items: BatchItem[];
  done: number;
  total: number;
  runsPerDay: number;
}) {
  const completed = items.filter((i) => i.status === "done");
  const errored = items.filter((i) => i.status === "error");
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const totalCost = completed.reduce((sum, i) => sum + (i.result?.cost_usd ?? 0), 0);
  const totalTokens = completed.reduce((sum, i) => sum + (i.result?.total_tokens ?? 0), 0);

  const uniqueTicketIds = [...new Set(items.map((i) => i.ticket.id))];

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="font-semibold">
            {done < total
              ? `Analyzing… ${done} / ${total}`
              : `Complete — ${completed.length} succeeded, ${errored.length} failed`}
          </span>
          <div className="flex items-center gap-3">
            {totalCost > 0 && (
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-md" style={{ background: "#ef444422", color: "#ef4444", border: "1px solid #ef444433" }}>
                {fmt$(totalCost)} · {totalTokens.toLocaleString()} tok
              </span>
            )}
            <span style={{ color: "var(--text-muted)" }}>{pct}%</span>
          </div>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      {/* Savings estimator */}
      {done > 0 && <SavingsEstimator items={items} runsPerDay={runsPerDay} />}

      {/* Results grid — one row per ticket, columns per provider */}
      {done > 0 && (
        <div className="space-y-2">
          {uniqueTicketIds.map((ticketId) => {
            const ticket = items.find((i) => i.ticket.id === ticketId)!.ticket;
            const ticketItems = items.filter((i) => i.ticket.id === ticketId);
            return (
              <div
                key={ticketId}
                className="rounded-xl p-4 space-y-3"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-mono font-semibold">{ticket.id}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded capitalize"
                    style={{ background: "var(--surface2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                  >
                    {ticket.tier}
                  </span>
                  <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{ticket.transcript.slice(0, 70)}…</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ticketItems.map((item) => (
                    <BatchCell key={item.provider} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {done >= total && done > 0 && (
        <a
          href="/runs"
          className="block w-full text-center py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          View full history →
        </a>
      )}
    </div>
  );
}

function BatchCell({ item }: { item: BatchItem }) {
  const color = item.result ? SEVERITY_COLORS[item.result.output.severity] : undefined;

  return (
    <div
      className="rounded-lg px-3 py-2 min-w-[130px] space-y-1"
      style={{
        background: color ? `${color}11` : "var(--surface2)",
        border: `1px solid ${color ? `${color}44` : "var(--border)"}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{PROVIDER_DISPLAY[item.provider] ?? item.provider}</span>
        {item.status === "running" && (
          <span className="text-xs animate-pulse" style={{ color: "var(--text-muted)" }}>…</span>
        )}
        {item.status === "pending" && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>–</span>
        )}
        {item.status === "done" && item.result && (
          <span className="text-xs font-bold" style={{ color }}>
            {item.result.output.severity}
          </span>
        )}
        {item.status === "error" && (
          <span className="text-xs" style={{ color: "#ef4444" }}>err</span>
        )}
      </div>
      {item.result && (
        <>
          <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "var(--text-muted)" }}>
            {item.result.output.summary.slice(0, 80)}
          </p>
          <p className="text-xs font-mono font-semibold" style={{ color: "#10b981" }}>
            {fmt$(item.result.cost_usd)}
          </p>
        </>
      )}
      {item.error && (
        <p className="text-xs" style={{ color: "#ef4444" }}>{item.error.slice(0, 60)}</p>
      )}
      {item.result && (
        <div className="flex gap-2 pt-0.5">
          <a
            href={`/runs/${item.result.request_id}`}
            className="text-xs underline hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            trace
          </a>
          <a
            href={`/compare?a=${item.result.request_id}`}
            className="text-xs underline hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            compare
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [ticketIdx, setTicketIdx] = useState(0);
  const [transcript, setTranscript] = useState(SAMPLE_TICKETS[0].transcript);
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runsPerDay, setRunsPerDay] = useState(10000);

  // Batch state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchRunning, setBatchRunning] = useState(false);

  const isBusy = loading || batchRunning;
  const showBatch = batchTotal > 0;
  const currentTicket = SAMPLE_TICKETS[ticketIdx];

  useEffect(() => {
    getProviders()
      .then((d) => {
        setProviders(d.providers);
        setProvider(d.default_provider);
      })
      .catch(() => {});
  }, []);

  const selectedProvider = providers.find((p) => p.id === provider);
  const models = selectedProvider?.models ?? [];

  function dispatchCostEvent(cost: number, tokens: number) {
    window.dispatchEvent(new CustomEvent("run-complete", { detail: { cost, tokens } }));
  }

  async function handleRun() {
    setBatchTotal(0);
    setBatchItems([]);
    setLoading(true);
    setError(null);
    try {
      const res = await runTask({
        provider,
        model: model || undefined,
        input: {
          ticket_id: currentTicket.id,
          customer_tier: currentTicket.tier,
          transcript,
        },
      });
      setResult(res);
      dispatchCostEvent(res.cost_usd, res.total_tokens);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyzeAll() {
    const configured = providers.filter((p) => p.configured);
    if (configured.length === 0) {
      setError("No providers have API keys configured.");
      return;
    }

    setResult(null);
    setError(null);

    const pairs: BatchItem[] = SAMPLE_TICKETS.flatMap((ticket) =>
      configured.map((p) => ({
        ticket,
        provider: p.id,
        status: "pending" as const,
      }))
    );

    const total = pairs.length;
    setBatchItems(pairs);
    setBatchTotal(total);
    setBatchDone(0);
    setBatchRunning(true);

    await Promise.all(
      pairs.map(async (item, idx) => {
        setBatchItems((prev) =>
          prev.map((it, i) => (i === idx ? { ...it, status: "running" } : it))
        );
        try {
          const res = await runTask({
            provider: item.provider,
            input: {
              ticket_id: item.ticket.id,
              customer_tier: item.ticket.tier,
              transcript: item.ticket.transcript,
            },
          });
          setBatchItems((prev) =>
            prev.map((it, i) => (i === idx ? { ...it, status: "done", result: res } : it))
          );
          dispatchCostEvent(res.cost_usd, res.total_tokens);
        } catch (e) {
          setBatchItems((prev) =>
            prev.map((it, i) =>
              i === idx
                ? { ...it, status: "error", error: e instanceof Error ? e.message : String(e) }
                : it
            )
          );
        } finally {
          setBatchDone((n) => n + 1);
        }
      })
    );

    setBatchRunning(false);
  }

  const configuredCount = providers.filter((p) => p.configured).length;
  const totalCalls = SAMPLE_TICKETS.length * configuredCount * 3; // 3 LLM steps per ticket

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[440px_1fr] gap-8">
      {/* ── Left panel: form ── */}
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support Ticket Triage</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            AI-powered support: classify severity, identify root cause, and draft a customer response.
          </p>
        </div>

        {/* Provider */}
        <div
          className="rounded-xl p-5 space-y-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-semibold">Provider</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Provider</Label>
              <Select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel("");
                }}
              >
                {providers.length > 0 ? (
                  providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {PROVIDER_DISPLAY[p.id] ?? p.id}{!p.configured ? " (no key)" : ""}
                    </option>
                  ))
                ) : (
                  <option value="openai">openai</option>
                )}
              </Select>
            </div>
            <div>
              <Label>Model</Label>
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">default</option>
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {/* Ticket */}
        <div
          className="rounded-xl p-5 space-y-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-semibold">Support Ticket</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Ticket ID</Label>
              <Input value={currentTicket.id} readOnly style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", opacity: 0.7 }} />
            </div>
            <div>
              <Label>Customer Tier</Label>
              <Input value={currentTicket.tier} readOnly style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", opacity: 0.7, textTransform: "capitalize" }} />
            </div>
          </div>

          <div>
            <Label>Sample Ticket</Label>
            <div className="flex gap-1 mb-2 flex-wrap">
              {SAMPLE_TICKETS.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTicketIdx(i);
                    setTranscript(t.transcript);
                  }}
                  className="text-xs px-2 py-0.5 rounded transition-colors"
                  style={{
                    background: ticketIdx === i ? "var(--accent)" : "var(--surface2)",
                    color: ticketIdx === i ? "white" : "var(--text-muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {t.id.replace("INC-", "")}
                </button>
              ))}
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={4}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleRun}
            disabled={isBusy}
            className="py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {loading ? "Analyzing…" : "Analyze Ticket"}
          </button>
          <button
            onClick={handleAnalyzeAll}
            disabled={isBusy}
            className="py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            title={`Run all ${SAMPLE_TICKETS.length} tickets × ${configuredCount} providers × 3 LLM calls = ${totalCalls} total`}
          >
            {batchRunning ? `${batchDone} / ${batchTotal}…` : "Analyze All"}
          </button>
        </div>

        {providers.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
              Runs all {SAMPLE_TICKETS.length} tickets against each configured provider —{" "}
              <strong>{totalCalls} LLM calls total</strong>
            </p>
            {/* Runs/day slider for savings estimator */}
            <div className="rounded-lg p-3 space-y-1.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between text-xs">
                <label style={{ color: "var(--text-muted)" }}>Support tickets / day</label>
                <span className="font-semibold">{runsPerDay.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min={1000}
                max={100000}
                step={1000}
                value={runsPerDay}
                onChange={(e) => setRunsPerDay(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                <span>1K startup</span>
                <span>10K growing</span>
                <span>100K enterprise</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel: result ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          {showBatch ? "Batch Results" : "Result"}
        </h2>

        {error && (
          <div
            className="rounded-xl p-4 text-sm"
            style={{ background: "#ef444411", border: "1px solid #ef444433", color: "#ef4444" }}
          >
            {error}
          </div>
        )}

        {showBatch ? (
          <BatchResultsPanel items={batchItems} done={batchDone} total={batchTotal} runsPerDay={runsPerDay} />
        ) : (
          <>
            {loading && (
              <div
                className="rounded-xl p-8 text-center text-sm animate-pulse"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                Running 3-step pipeline (triage → analysis → response)…
              </div>
            )}

            {!loading && !result && !error && (
              <div
                className="rounded-xl p-8 text-center space-y-2"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                <p className="text-sm">Select a ticket and click <strong>Analyze Ticket</strong>.</p>
                <p className="text-xs">Each ticket triggers <strong>3 sequential LLM calls</strong>: severity triage, root-cause analysis, and a draft customer response.</p>
              </div>
            )}

            {!loading && result && <ResultPanel result={result} />}
          </>
        )}
      </div>
    </div>
  );
}
