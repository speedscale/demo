"use client";

import { useState, useEffect } from "react";
import { runTask, getProviders } from "@/lib/api";
import type { ProviderInfo, RunResult } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";

const SAMPLE_TICKETS = [
  {
    id: "INC-4201",
    tier: "enterprise",
    transcript: "Customer cannot complete checkout after an address update triggered a tax recalculation error.",
  },
  {
    id: "INC-4202",
    tier: "standard",
    transcript: "Payment declined on every retry since the last deploy went out at 14:00 UTC.",
  },
  {
    id: "INC-4203",
    tier: "vip",
    transcript: "Order tracking page shows no data for orders placed in the last 48 hours.",
  },
  {
    id: "INC-4204",
    tier: "standard",
    transcript: "Subscription renewal charged twice this billing cycle; customer is requesting a refund.",
  },
  {
    id: "INC-4205",
    tier: "enterprise",
    transcript: "App crashes on iOS 17 when uploading a profile photo larger than 2MB.",
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

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

function ResultPanel({ result }: { result: RunResult }) {
  const order = result.tool_calls.find((t) => t.name === "lookup_order");
  const policy = result.tool_calls.find((t) => t.name === "lookup_policy");

  const severityBg: Record<string, string> = {
    low: "#10b98111",
    medium: "#f59e0b11",
    high: "#f9731611",
    critical: "#ef444411",
  };

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ background: severityBg[result.output.severity] ?? "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <SeverityBadge severity={result.output.severity} />
          <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{result.request_id}</span>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Summary</p>
          <p className="text-sm leading-relaxed">{result.output.summary}</p>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: "#10b98108", border: "1px solid #10b98133" }}>
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "#10b981" }}>Recommended Action</p>
        <p className="text-sm leading-relaxed">{result.output.recommended_action}</p>
      </div>

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

// ── Batch results ──────────────────────────────────────────────────────────

interface BatchItem {
  ticket: (typeof SAMPLE_TICKETS)[number];
  provider: string;
  status: "pending" | "running" | "done" | "error";
  result?: RunResult;
  error?: string;
}

function BatchResultsPanel({
  items,
  done,
  total,
}: {
  items: BatchItem[];
  done: number;
  total: number;
}) {
  const completed = items.filter((i) => i.status === "done");
  const errored = items.filter((i) => i.status === "error");
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">
            {done < total ? `Analyzing… ${done} / ${total}` : `Complete — ${completed.length} succeeded, ${errored.length} failed`}
          </span>
          <span style={{ color: "var(--text-muted)" }}>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      {/* Results grid — one row per ticket, one column per provider */}
      {done > 0 && (
        <div className="space-y-2">
          {SAMPLE_TICKETS.map((ticket) => {
            const ticketItems = items.filter((i) => i.ticket.id === ticket.id);
            return (
              <div
                key={ticket.id}
                className="rounded-xl p-4 space-y-3"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-semibold">{ticket.id}</span>
                  <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{ticket.transcript.slice(0, 60)}…</span>
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
      className="rounded-lg px-3 py-2 min-w-[120px] space-y-1"
      style={{
        background: color ? `${color}11` : "var(--surface2)",
        border: `1px solid ${color ? `${color}44` : "var(--border)"}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{item.provider}</span>
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
        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "var(--text-muted)" }}>
          {item.result.output.summary.slice(0, 80)}
        </p>
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

// ── Main page ──────────────────────────────────────────────────────────────

export default function HomePage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [ticketId, setTicketId] = useState(SAMPLE_TICKETS[0].id);
  const [tier, setTier] = useState(SAMPLE_TICKETS[0].tier);
  const [transcript, setTranscript] = useState(SAMPLE_TICKETS[0].transcript);
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Batch state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchRunning, setBatchRunning] = useState(false);

  const isBusy = loading || batchRunning;
  const showBatch = batchTotal > 0;

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

  async function handleRun() {
    setBatchTotal(0);
    setBatchItems([]);
    setLoading(true);
    setError(null);
    try {
      const res = await runTask({
        provider,
        model: model || undefined,
        input: { ticket_id: ticketId, customer_tier: tier, transcript },
      });
      setResult(res);
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

    // Build the full matrix of (ticket, provider) pairs
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

    // Run all in parallel, updating state as each completes
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-8">
      {/* ── Left panel: form ── */}
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ticket Triage</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            AI-powered analysis for support tickets.
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
                      {p.id}{!p.configured ? " (no key)" : ""}
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
              <Input value={ticketId} onChange={(e) => setTicketId(e.target.value)} placeholder="INC-4201" />
            </div>
            <div>
              <Label>Customer Tier</Label>
              <Select value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="standard">Standard</option>
                <option value="enterprise">Enterprise</option>
                <option value="vip">VIP</option>
              </Select>
            </div>
          </div>

          <div>
            <Label>Transcript</Label>
            <div className="flex gap-1 mb-1.5 flex-wrap">
              {SAMPLE_TICKETS.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTicketId(t.id);
                    setTier(t.tier);
                    setTranscript(t.transcript);
                  }}
                  className="text-xs px-2 py-0.5 rounded transition-colors"
                  style={{
                    background: transcript === t.transcript ? "var(--accent)" : "var(--surface2)",
                    color: transcript === t.transcript ? "white" : "var(--text-muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  #{i + 1}
                </button>
              ))}
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={3}
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
            title={`Run all 5 tickets against all configured providers`}
          >
            {batchRunning ? `${batchDone} / ${batchTotal}…` : "Analyze All"}
          </button>
        </div>

        {providers.length > 0 && (
          <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
            Analyze All runs{" "}
            <strong>{SAMPLE_TICKETS.length} tickets × {providers.filter((p) => p.configured).length} provider{providers.filter((p) => p.configured).length !== 1 ? "s" : ""}</strong>
            {" "}= {SAMPLE_TICKETS.length * providers.filter((p) => p.configured).length} calls
          </p>
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
          <BatchResultsPanel items={batchItems} done={batchDone} total={batchTotal} />
        ) : (
          <>
            {loading && (
              <div
                className="rounded-xl p-8 text-center text-sm animate-pulse"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                Calling provider…
              </div>
            )}

            {!loading && !result && !error && (
              <div
                className="rounded-xl p-8 text-center text-sm"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                Select a ticket and click <strong>Analyze Ticket</strong> to see the AI analysis here.
              </div>
            )}

            {!loading && result && <ResultPanel result={result} />}
          </>
        )}
      </div>
    </div>
  );
}
