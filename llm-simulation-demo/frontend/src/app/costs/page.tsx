"use client";

import { useEffect, useState } from "react";
import { listRuns } from "@/lib/api";
import type { RunResult } from "@/lib/types";

const PROVIDER_DISPLAY: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  xai: "xAI / Grok",
};

function fmt$(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtLarge(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmt$(n);
}

export default function CostsPage() {
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsPerDay, setRunsPerDay] = useState(10000);

  useEffect(() => {
    function refresh() {
      listRuns(500)
        .then((d) => setRuns(d.runs))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    refresh();
    function onRunComplete() {
      // Refresh from backend whenever a new run completes elsewhere in the app.
      refresh();
    }
    window.addEventListener("run-complete", onRunComplete);
    return () => window.removeEventListener("run-complete", onRunComplete);
  }, []);

  const liveRuns = runs.filter((r) => !r.mocked);
  const mockedRuns = runs.filter((r) => r.mocked);
  const liveCost = liveRuns.reduce((s, r) => s + r.cost_usd, 0);
  const savedCost = mockedRuns.reduce((s, r) => s + r.cost_usd, 0);
  const totalTokens = runs.reduce((s, r) => s + r.total_tokens, 0);
  const totalCalls = runs.length * 3;
  // Use live runs for scale projection — they reflect real-world cost
  const baselineRuns = liveRuns.length > 0 ? liveRuns : runs;
  const avgPerTicket = baselineRuns.length > 0
    ? baselineRuns.reduce((s, r) => s + r.cost_usd, 0) / baselineRuns.length
    : 0;

  // Group by provider and by model
  const byProvider: Record<string, { cost: number; tokens: number; count: number }> = {};
  const byModel: Record<string, { provider: string; cost: number; tokens: number; count: number; mocked: boolean }> = {};
  for (const run of runs) {
    if (!byProvider[run.provider]) byProvider[run.provider] = { cost: 0, tokens: 0, count: 0 };
    byProvider[run.provider].cost += run.cost_usd;
    byProvider[run.provider].tokens += run.total_tokens;
    byProvider[run.provider].count += 1;

    // Key by model+mode so live and mocked rows show separately
    const key = `${run.model}::${run.mocked ? "mock" : "live"}`;
    if (!byModel[key]) byModel[key] = { provider: run.provider, cost: 0, tokens: 0, count: 0, mocked: !!run.mocked };
    byModel[key].cost += run.cost_usd;
    byModel[key].tokens += run.total_tokens;
    byModel[key].count += 1;
  }

  const dailyCost = avgPerTicket * runsPerDay;
  const monthlyCost = dailyCost * 30;
  const annualCost = dailyCost * 365;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Costs</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          All LLM spend so far, served from the backend run store.
        </p>
      </div>

      {loading && (
        <p className="text-sm animate-pulse" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      )}

      {!loading && runs.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No runs yet.{" "}
          <a href="/" className="underline">
            Analyze a ticket
          </a>{" "}
          to see costs accumulate.
        </p>
      )}

      {runs.length > 0 && (
        <>
          {/* Totals: live spend vs simulated savings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl p-5 text-center space-y-1" style={{ background: "#ef444411", border: "1px solid #ef444433" }}>
              <p className="text-xs uppercase tracking-wider" style={{ color: "#ef4444" }}>Live spend (billed)</p>
              <p className="text-4xl font-bold leading-none font-mono" style={{ color: "#ef4444" }}>{fmt$(liveCost)}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{liveRuns.length} tickets · {liveRuns.length * 3} LLM calls</p>
            </div>
            <div className="rounded-xl p-5 text-center space-y-1" style={{ background: "#10b98111", border: "1px solid #10b98133" }}>
              <p className="text-xs uppercase tracking-wider" style={{ color: "#10b981" }}>Saved by simulation</p>
              <p className="text-4xl font-bold leading-none font-mono" style={{ color: "#10b981" }}>{fmt$(savedCost)}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{mockedRuns.length} tickets · {mockedRuns.length * 3} mocked calls</p>
            </div>
            <div className="rounded-xl p-5 text-center space-y-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Tokens · avg/ticket</p>
              <p className="text-4xl font-bold leading-none font-mono">{totalTokens.toLocaleString()}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{fmt$(avgPerTicket)} per ticket {liveRuns.length === 0 ? "(simulated baseline)" : "(live baseline)"}</p>
            </div>
          </div>

          {/* Per-model breakdown */}
          <div className="rounded-xl p-5 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-sm font-bold">By model</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "var(--text-muted)" }} className="text-left text-xs uppercase tracking-wider">
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">Provider</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-4 text-right">Tickets</th>
                    <th className="py-2 pr-4 text-right">Tokens</th>
                    <th className="py-2 pr-4 text-right">Avg / ticket</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byModel)
                    .sort((a, b) => b[1].cost - a[1].cost)
                    .map(([key, info]) => {
                      const model = key.split("::")[0];
                      const color = info.mocked ? "#10b981" : "#ef4444";
                      return (
                        <tr key={key} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="py-2 pr-4 font-mono">{model}</td>
                          <td className="py-2 pr-4" style={{ color: "var(--text-muted)" }}>
                            {PROVIDER_DISPLAY[info.provider] ?? info.provider}
                          </td>
                          <td className="py-2 pr-4">
                            <span
                              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                              style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
                            >
                              {info.mocked ? "Simulated" : "Live"}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">{info.count}</td>
                          <td className="py-2 pr-4 text-right font-mono" style={{ color: "var(--text-muted)" }}>
                            {info.tokens.toLocaleString()}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">{fmt$(info.cost / info.count)}</td>
                          <td className="py-2 text-right font-mono font-bold" style={{ color }}>
                            {fmt$(info.cost)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-provider breakdown */}
          <div className="rounded-xl p-5 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <p className="text-sm font-bold">By provider</p>
            <div className="space-y-2">
              {Object.entries(byProvider)
                .sort((a, b) => b[1].cost - a[1].cost)
                .map(([prov, info]) => {
                  const grandTotal = liveCost + savedCost;
                  const pct = grandTotal > 0 ? (info.cost / grandTotal) * 100 : 0;
                  return (
                    <div key={prov} className="flex items-center gap-3 text-xs">
                      <span className="w-28 font-medium">{PROVIDER_DISPLAY[prov] ?? prov}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
                      </div>
                      <span className="w-16 text-right font-mono" style={{ color: "var(--text-muted)" }}>
                        {info.count} tkt
                      </span>
                      <span className="w-24 text-right font-mono font-bold" style={{ color: "#ef4444" }}>
                        {fmt$(info.cost)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Cost at scale */}
          <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div>
              <p className="text-sm font-bold">Cost at scale</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Projected from {fmt$(avgPerTicket)} avg / ticket
                {liveRuns.length === 0 && " — no live runs yet, using simulated cost as a stand-in"}
              </p>
            </div>

            <div className="space-y-1.5">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4 text-center space-y-1" style={{ background: "#ef444411", border: "1px solid #ef444433" }}>
                <p className="text-xs uppercase tracking-wider" style={{ color: "#ef4444" }}>Annual LLM spend</p>
                <p className="text-3xl font-bold leading-none" style={{ color: "#ef4444" }}>{fmtLarge(annualCost)}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {fmt$(dailyCost)}/day · {fmtLarge(monthlyCost)}/mo
                </p>
              </div>
              <div className="rounded-xl p-4 text-center space-y-1" style={{ background: "#10b98111", border: "1px solid #10b98133" }}>
                <p className="text-xs uppercase tracking-wider" style={{ color: "#10b981" }}>With simulation</p>
                <p className="text-3xl font-bold leading-none" style={{ color: "#10b981" }}>$0</p>
                <p className="text-xs font-semibold" style={{ color: "#10b981" }}>
                  Save {fmtLarge(annualCost)} / year
                </p>
              </div>
            </div>

            <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              <p>
                <strong style={{ color: "var(--text)" }}>How simulation eliminates this cost:</strong>
              </p>
              <p>
                Speedscale captures the exact traffic pattern from this run — real tickets, real LLM responses — and
                replays it at any scale without calling the API. Your support pipeline gets realistic responses in
                testing and load scenarios for $0.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
