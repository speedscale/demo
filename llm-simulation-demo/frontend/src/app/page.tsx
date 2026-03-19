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
      "Customer cannot complete checkout after an address update triggered a tax recalculation error. They have been unable to place orders for 6 hours. This is blocking $47,000 in pending orders for their Q4 inventory restock. They report seeing a 500 error on the /checkout/confirm endpoint. Affects all 12 users in their organization.",
  },
  {
    id: "INC-4202",
    tier: "standard",
    transcript:
      "Payment declined on every retry since the last deploy went out at 14:00 UTC. Customer tried Visa, Mastercard, and PayPal — all fail with 'payment processor unavailable'. No error message shown to the customer. Started exactly at 14:02 UTC based on their logs.",
  },
  {
    id: "INC-4203",
    tier: "vip",
    transcript:
      "Order tracking page shows no data for any orders placed in the last 48 hours. The customer manages logistics for 200+ daily orders and their warehouse team is completely blind. They are considering reverting to manual tracking which would cost them 8 staff hours per day. Need immediate resolution.",
  },
  {
    id: "INC-4204",
    tier: "standard",
    transcript:
      "Subscription renewal charged twice this billing cycle. Customer shows two identical charges of $299 on their credit card statement dated March 1st at 03:14 and 03:16 UTC. They want a refund for the duplicate charge and assurance this won't happen again. Very frustrated.",
  },
  {
    id: "INC-4205",
    tier: "enterprise",
    transcript:
      "App crashes immediately on iOS 17.4 when attempting to upload a profile photo larger than 2MB. Reproducible 100% of the time. Works fine on Android. The crash happens in the image compression library. This is blocking our entire mobile field team from updating their profiles before an important client presentation tomorrow.",
  },
  {
    id: "INC-4206",
    tier: "vip",
    transcript:
      "Our API integration has been returning HTTP 503 errors for the past 3 hours on all endpoints. We are a real-time inventory management system and this outage is causing our downstream systems to accumulate a backlog of 15,000 unprocessed events. Every minute of downtime costs us approximately $200 in SLA penalties to our own customers.",
  },
  {
    id: "INC-4207",
    tier: "enterprise",
    transcript:
      "Bulk order import has been stuck at 0% processing for 6 hours. We uploaded a CSV with 8,500 orders for our holiday campaign. The UI shows the job is queued but no progress. This is our biggest sales event of the year and orders are not being processed. We cannot contact customers with order confirmations.",
  },
  {
    id: "INC-4208",
    tier: "standard",
    transcript:
      "Password reset emails are not arriving. Tested with 5 different email addresses across Gmail, Outlook, and Yahoo. Checked spam folders. No emails received. This has been happening for at least 2 days. Multiple new customers cannot access their accounts, causing us to lose signups.",
  },
  {
    id: "INC-4209",
    tier: "vip",
    transcript:
      "Inventory sync has a 45-minute lag causing significant overselling. We have already oversold 340 units of a limited-edition product that we only have 200 units of. Customers are placing orders for items we cannot fulfill. We need the sync frequency increased to under 5 minutes or we face chargebacks and reputation damage.",
  },
  {
    id: "INC-4210",
    tier: "enterprise",
    transcript:
      "GDPR right-to-erasure request submitted 15 days ago has not been processed. Under GDPR Article 17 we have a 30-day window but our legal team requires us to act within 15 days. The customer's data is still visible in the admin panel. We face a regulatory audit next week and need this resolved urgently.",
  },
  {
    id: "INC-4211",
    tier: "standard",
    transcript:
      "Product page images are broken and showing alt text in Chrome 123 on Windows. Works fine in Firefox and Safari. Started about 3 days ago. Affecting our storefront — potential customers are seeing a broken shopping experience. Images load fine on mobile Chrome.",
  },
  {
    id: "INC-4212",
    tier: "enterprise",
    transcript:
      "Monthly invoice for March shows $12,400 in usage charges that we don't recognize. Line items reference API calls to endpoints we never use. Our normal monthly bill is around $3,200. We need an itemized breakdown and a credit for any incorrect charges before our accounts payable deadline on Friday.",
  },
  {
    id: "INC-4213",
    tier: "vip",
    transcript:
      "SSO login via SAML is completely broken for all 500 users in our organization since a certificate rotation this morning. Nobody can log in. Our entire team is locked out of the platform during our busiest operational period — end-of-month reporting. We have a board presentation in 4 hours that requires access to the platform.",
  },
  {
    id: "INC-4214",
    tier: "standard",
    transcript:
      "Refund was processed 8 days ago (refund ID: REF-88921) but credit has not appeared on the customer's card. Bank confirms no pending credit. Amount is $156.00. Customer is threatening a chargeback which will cost us the $15 fee plus damage our merchant rating.",
  },
  {
    id: "INC-4215",
    tier: "enterprise",
    transcript:
      "Webhook deliveries to our endpoint have been failing silently for 4 days. We only discovered this when we noticed our order management system was out of sync. We missed 2,800 order events. The webhook logs in the dashboard show all deliveries as 'success' but our server logs show no incoming requests. This is a critical data integrity issue.",
  },
  {
    id: "INC-4216",
    tier: "standard",
    transcript:
      "Mobile app is stuck on the loading screen for all users on Android 14 devices. Force-closing and reinstalling doesn't help. Started after the app update pushed yesterday. Approximately 30% of our mobile users are on Android 14. They are using competitors' apps in the meantime.",
  },
  {
    id: "INC-4217",
    tier: "vip",
    transcript:
      "Our custom domain SSL certificate expired 2 hours ago causing a complete storefront outage. Browsers are showing 'connection not secure' warnings and customers cannot proceed. We are losing approximately $3,000 per hour in revenue. We contacted support 3 weeks ago about the upcoming expiration but received no response.",
  },
  {
    id: "INC-4218",
    tier: "enterprise",
    transcript:
      "Automated weekly reports stopped generating as of Monday. Our executive team relies on these for Monday morning review meetings. The reports run at 06:00 UTC via scheduled job. No error emails were sent. The reporting dashboard shows the last successful run as Sunday. This has now missed 2 scheduled runs.",
  },
  {
    id: "INC-4219",
    tier: "standard",
    transcript:
      "Two-factor authentication setup keeps looping back to the setup screen after scanning the QR code with Google Authenticator. The verification code appears to be accepted (no error shown) but the account shows 2FA as 'not configured'. Customer has tried 3 different authenticator apps. Cannot enable 2FA which is required for their company security policy.",
  },
  {
    id: "INC-4220",
    tier: "vip",
    transcript:
      "Data export for compliance audit returns a corrupted CSV file. We requested a full export of all transaction records for the past 24 months (approximately 180,000 rows). The downloaded file is 2KB instead of the expected ~50MB. The file contains only headers and 3 rows. Our auditors arrive on Thursday and require this data.",
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
