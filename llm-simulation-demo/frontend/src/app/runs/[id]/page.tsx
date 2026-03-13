"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getRun } from "@/lib/api";
import type { RunResult } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";
import { ToolCallList } from "@/components/ToolCallList";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      className="rounded-lg p-4 text-xs overflow-x-auto font-mono leading-relaxed"
      style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "#a5f3fc" }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function TracePage() {
  const params = useParams<{ id: string }>();
  const [run, setRun] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    getRun(params.id)
      .then(setRun)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <p className="animate-pulse text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }
  if (error || !run) {
    return (
      <p className="text-sm" style={{ color: "#ef4444" }}>
        {error ?? "Run not found"}
      </p>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center gap-4">
        <a href="/runs" className="text-sm hover:opacity-80" style={{ color: "var(--text-muted)" }}>
          ← Runs
        </a>
        <h1 className="text-2xl font-bold tracking-tight">Trace</h1>
      </div>

      {/* Header */}
      <div
        className="rounded-xl p-5 flex flex-wrap items-center gap-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <SeverityBadge severity={run.output.severity} />
        <div className="flex gap-6 text-sm flex-wrap">
          <div>
            <span style={{ color: "var(--text-muted)" }}>Requested: </span>
            <span className="font-medium">{run.provider_requested}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Used: </span>
            <span className="font-medium">{run.provider_used}</span>
          </div>
          {run.fallback_triggered && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: "#f9731622", color: "#f97316" }}>
              fallback triggered
            </span>
          )}
          {run.error && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: "#ef444422", color: "#ef4444" }}>
              error
            </span>
          )}
        </div>
      </div>

      <Section title="Output">
        <JsonBlock value={run.output} />
      </Section>

      <Section title="Tool Calls">
        <ToolCallList tools={run.tool_calls} />
      </Section>

      <Section title="Timing">
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Provider ms", value: run.timing.provider_ms },
            { label: "Total ms", value: run.timing.total_ms },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg p-4"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
            >
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                {label}
              </p>
              <p className="text-2xl font-bold font-mono">{value}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Simulation Config">
        <JsonBlock value={run.simulation} />
      </Section>

      <Section title="Full Envelope">
        <JsonBlock value={run} />
      </Section>

      <div className="flex gap-3">
        <a
          href={`/compare?a=${run.request_id}`}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Compare with another run
        </a>
      </div>
    </div>
  );
}
