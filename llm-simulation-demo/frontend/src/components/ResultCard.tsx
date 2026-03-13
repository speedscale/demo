"use client";

import type { RunResult } from "@/lib/types";
import { SeverityBadge } from "./SeverityBadge";
import { ToolCallList } from "./ToolCallList";

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
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SeverityBadge severity={result.output.severity} />
          {result.fallback_triggered && (
            <span
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{ background: "#f97316" + "22", color: "#f97316", border: "1px solid #f9731644" }}
            >
              Fallback triggered
            </span>
          )}
          {result.error && (
            <span
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{ background: "#ef444422", color: "#ef4444", border: "1px solid #ef444444" }}
            >
              Provider error
            </span>
          )}
        </div>
        <div className="flex gap-6">
          <Stat label="Provider used" value={result.provider_used} />
          <Stat label="Provider ms" value={result.timing.provider_ms} />
          <Stat label="Total ms" value={result.timing.total_ms} />
        </div>
      </div>

      {/* Output */}
      <div className="space-y-3">
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            Summary
          </p>
          <p className="text-sm leading-relaxed">{result.output.summary}</p>
        </div>
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            Recommended Action
          </p>
          <p className="text-sm leading-relaxed">{result.output.recommended_action}</p>
        </div>
      </div>

      {/* Tool calls */}
      {result.tool_calls.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Tool Calls
          </p>
          <ToolCallList tools={result.tool_calls} />
        </div>
      )}

      {/* Request ID */}
      <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
        {result.request_id}
      </p>
    </div>
  );
}
