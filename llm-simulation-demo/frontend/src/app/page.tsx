"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { runTask, runScenario, getProviders, getScenarios } from "@/lib/api";
import type { RunResult, ProviderInfo, Scenario, SimulationConfig, RunRequest } from "@/lib/types";
import { ResultCard } from "@/components/ResultCard";

const DEFAULT_SIM: SimulationConfig = {
  mode: "live",
  inject_latency_ms: 0,
  inject_status: null,
  inject_malformed_tool_json: false,
  fallback_provider: null,
};

const SAMPLE_TRANSCRIPTS = [
  "Customer cannot complete checkout after address update triggered a tax recalculation.",
  "Payment declined on every retry since the last deploy went out at 14:00 UTC.",
  "Order tracking page shows no data for orders placed in the last 48 hours.",
  "Subscription renewal charged twice this billing cycle; customer wants refund.",
  "App crashes on iOS 17 when uploading a profile photo larger than 2MB.",
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
      {children}
    </label>
  );
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 transition-all",
        className
      )}
      style={{
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        color: "var(--text)",
      }}
      {...props}
    />
  );
}

function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx("w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 transition-all", className)}
      style={{
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        color: "var(--text)",
      }}
      {...props}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        className="relative w-9 h-5 rounded-full transition-colors"
        style={{ background: checked ? "var(--accent)" : "var(--border)" }}
        onClick={() => onChange(!checked)}
      >
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
        />
      </div>
      <span className="text-sm">{label}</span>
    </label>
  );
}

export default function HomePage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [ticketId, setTicketId] = useState("INC-1042");
  const [tier, setTier] = useState("enterprise");
  const [transcript, setTranscript] = useState(SAMPLE_TRANSCRIPTS[0]);
  const [sim, setSim] = useState<SimulationConfig>({ ...DEFAULT_SIM });
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProviders()
      .then((d) => {
        setProviders(d.providers);
        setProvider(d.default_provider);
      })
      .catch(() => {});
    getScenarios()
      .then((d) => setScenarios(d.scenarios))
      .catch(() => {});
  }, []);

  const currentProvider = providers.find((p) => p.id === provider);
  const models = currentProvider?.models ?? [];

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const req: RunRequest = {
        task: "summarize_ticket",
        provider,
        model: model || undefined,
        input: { ticket_id: ticketId, customer_tier: tier, transcript },
        simulation: sim,
      };
      const res = await runTask(req);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleScenario(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await runScenario(id);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-8">
      {/* LEFT: Form */}
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LLM Simulation Demo</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Run a support ticket through any provider with real failure injection.
          </p>
        </div>

        {/* Quick scenarios */}
        {scenarios.length > 0 && (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Quick scenarios
            </p>
            <div className="flex flex-wrap gap-2">
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleScenario(s.id)}
                  disabled={loading}
                  title={s.description}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Provider + model */}
        <div
          className="rounded-xl p-5 space-y-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-semibold">Provider</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Provider</Label>
              <Select value={provider} onChange={(e) => { setProvider(e.target.value); setModel(""); }}>
                {providers.length > 0
                  ? providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id} {p.configured ? "" : "(no key)"}
                      </option>
                    ))
                  : <option value="openai">openai</option>}
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

        {/* Ticket input */}
        <div
          className="rounded-xl p-5 space-y-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-semibold">Support Ticket</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Ticket ID</Label>
              <Input value={ticketId} onChange={(e) => setTicketId(e.target.value)} placeholder="INC-1042" />
            </div>
            <div>
              <Label>Customer Tier</Label>
              <Select value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="standard">standard</option>
                <option value="enterprise">enterprise</option>
                <option value="vip">vip</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Transcript</Label>
            <div className="flex gap-1 mb-1 flex-wrap">
              {SAMPLE_TRANSCRIPTS.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setTranscript(t)}
                  className="text-xs px-2 py-0.5 rounded transition-colors"
                  style={{
                    background: transcript === t ? "var(--accent)" : "var(--surface2)",
                    color: transcript === t ? "white" : "var(--text-muted)",
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
              style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
          </div>
        </div>

        {/* Simulation controls */}
        <div
          className="rounded-xl p-5 space-y-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-semibold">Simulation Controls</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Inject Latency (ms)</Label>
              <Input
                type="number"
                min={0}
                step={100}
                value={sim.inject_latency_ms}
                onChange={(e) => setSim((s) => ({ ...s, inject_latency_ms: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Inject HTTP Status</Label>
              <Select
                value={sim.inject_status ?? ""}
                onChange={(e) =>
                  setSim((s) => ({ ...s, inject_status: e.target.value ? Number(e.target.value) : null }))
                }
              >
                <option value="">None</option>
                <option value="429">429 Rate Limit</option>
                <option value="500">500 Server Error</option>
                <option value="503">503 Unavailable</option>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Toggle
              checked={sim.inject_malformed_tool_json}
              onChange={(v) => setSim((s) => ({ ...s, inject_malformed_tool_json: v }))}
              label="Malformed tool JSON (schema drift)"
            />
          </div>

          <div>
            <Label>Fallback Provider</Label>
            <Select
              value={sim.fallback_provider ?? ""}
              onChange={(e) =>
                setSim((s) => ({ ...s, fallback_provider: e.target.value || null }))
              }
            >
              <option value="">None</option>
              {providers
                .filter((p) => p.id !== provider)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.id}</option>
                ))}
            </Select>
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {loading ? "Running…" : "Run Task"}
        </button>
      </div>

      {/* RIGHT: Result */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Result</h2>

        {error && (
          <div
            className="rounded-xl p-4 text-sm"
            style={{ background: "#ef444411", border: "1px solid #ef444433", color: "#ef4444" }}
          >
            {error}
          </div>
        )}

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
            Run a task or pick a scenario to see results here.
          </div>
        )}

        {!loading && result && <ResultCard result={result} />}

        {!loading && result && (
          <div className="flex gap-3">
            <a
              href={`/runs/${result.request_id}`}
              className="flex-1 py-2 rounded-lg text-sm text-center font-medium transition-colors hover:opacity-80"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              View trace
            </a>
            <a
              href={`/compare?a=${result.request_id}`}
              className="flex-1 py-2 rounded-lg text-sm text-center font-medium transition-colors hover:opacity-80"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              Compare runs
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
