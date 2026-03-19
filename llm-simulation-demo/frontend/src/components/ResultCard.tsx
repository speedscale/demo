"use client";

import type { RunResult } from "@/lib/types";
import { SeverityBadge } from "./SeverityBadge";
import { ToolCallList } from "./ToolCallList";

function fmt$(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export function ResultCard({ result }: { result: RunResult }) {
  return (
    <div
      className="rounded-xl p-6 space-y-6"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SeverityBadge severity={result.output.severity} />
          {result.error && (
            <span
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{ background: "#ef444422", color: "#ef4444", border: "1px solid #ef444444" }}
            >
              Provider error
            </span>
          )}
        </div>
        <div className="flex gap-4 flex-wrap items-end">
          <Stat label="Provider" value={`${result.provider} / ${result.model}`} />
          <Stat label="Tokens" value={result.total_tokens.toLocaleString()} />
          <Stat label="Cost" value={fmt$(result.cost_usd)} />
          <Stat label="Total ms" value={result.timing.total_ms} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Summary</p>
          <p className="text-sm leading-relaxed">{result.output.summary}</p>
        </div>
        {result.output.root_cause && (
          <div className="rounded-lg p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Root Cause</p>
            <p className="text-sm leading-relaxed">{result.output.root_cause}</p>
          </div>
        )}
        <div className="rounded-lg p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Recommended Action</p>
          <p className="text-sm leading-relaxed">{result.output.recommended_action}</p>
        </div>
      </div>

      {/* LLM pipeline step breakdown */}
      {result.steps.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Pipeline ({result.steps.length} LLM calls)
          </p>
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {result.steps.map((step, i) => (
              <div
                key={step.name}
                className="flex items-center justify-between px-4 py-2.5 text-xs"
                style={{
                  background: i % 2 === 0 ? "var(--surface2)" : "var(--surface)",
                  borderBottom: i < result.steps.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <span className="font-mono capitalize w-24">{step.name}</span>
                <span style={{ color: "var(--text-muted)" }}>{(step.prompt_tokens + step.completion_tokens).toLocaleString()} tok</span>
                <span style={{ color: "var(--text-muted)" }}>{step.duration_ms}ms</span>
                <span className="font-semibold font-mono" style={{ color: "#10b981" }}>{fmt$(step.cost_usd)}</span>
              </div>
            ))}
            <div
              className="flex items-center justify-between px-4 py-2.5 text-xs font-semibold"
              style={{ background: "#10b98108", borderTop: "1px solid #10b98133" }}
            >
              <span>Total</span>
              <span>{result.total_tokens.toLocaleString()} tok</span>
              <span>{result.timing.provider_ms}ms</span>
              <span className="font-mono" style={{ color: "#10b981" }}>{fmt$(result.cost_usd)}</span>
            </div>
          </div>
        </div>
      )}

      {result.tool_calls.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Tool Calls</p>
          <ToolCallList tools={result.tool_calls} />
        </div>
      )}

      <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{result.request_id}</p>
    </div>
  );
}
