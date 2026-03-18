"use client";

import { useState, useEffect } from "react";
import { listRuns } from "@/lib/api";
import type { RunResult } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";

export default function RunsPage() {
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRuns(50)
      .then((d) => setRuns(d.runs.slice().reverse()))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Run History</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          All ticket analyses from this session.
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
          to get started.
        </p>
      )}

      <div className="space-y-2">
        {runs.map((run) => (
          <div
            key={run.request_id}
            className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 hover:opacity-90 transition-opacity"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-4 min-w-0">
              <SeverityBadge severity={run.output.severity} />
              <span className="font-mono text-xs truncate" style={{ color: "var(--text-muted)" }}>
                {run.request_id}
              </span>
              <span className="text-sm truncate hidden sm:block">{run.output.summary}</span>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {run.provider}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {run.timing.total_ms}ms
              </span>
              <div className="flex gap-2">
                <a
                  href={`/runs/${run.request_id}`}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  Trace
                </a>
                <a
                  href={`/compare?a=${run.request_id}`}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  Compare
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
