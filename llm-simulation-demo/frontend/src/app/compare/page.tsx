"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { listRuns, getRun } from "@/lib/api";
import type { RunResult } from "@/lib/types";
import { SeverityBadge } from "@/components/SeverityBadge";
import { ToolCallList } from "@/components/ToolCallList";

function diffClass(a: string | number, b: string | number) {
  return a !== b
    ? "rounded px-1 text-xs font-semibold"
    : "";
}

function diffStyle(a: string | number, b: string | number) {
  return a !== b
    ? { background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }
    : {};
}

function RunColumn({ run }: { run: RunResult }) {
  return (
    <div
      className="rounded-xl p-5 space-y-5 flex-1 min-w-0"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <p className="font-mono text-xs truncate" style={{ color: "var(--text-muted)" }}>
        {run.request_id}
      </p>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Severity
        </p>
        <SeverityBadge severity={run.output.severity} />
      </div>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Provider
        </p>
        <p className="text-sm font-medium">
          {run.provider_used}
          {run.fallback_triggered && (
            <span className="ml-2 text-xs" style={{ color: "#f97316" }}>
              (fallback)
            </span>
          )}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Summary
        </p>
        <p className="text-sm leading-relaxed">{run.output.summary}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Recommended Action
        </p>
        <p className="text-sm leading-relaxed">{run.output.recommended_action}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Tool Calls
        </p>
        <ToolCallList tools={run.tool_calls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-lg p-3"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Provider ms
          </p>
          <p className="text-xl font-bold font-mono">{run.timing.provider_ms}</p>
        </div>
        <div
          className="rounded-lg p-3"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Total ms
          </p>
          <p className="text-xl font-bold font-mono">{run.timing.total_ms}</p>
        </div>
      </div>
    </div>
  );
}

function DiffHighlighter({ runA, runB }: { runA: RunResult; runB: RunResult }) {
  const fields: { label: string; a: string | number; b: string | number }[] = [
    { label: "severity", a: runA.output.severity, b: runB.output.severity },
    { label: "provider used", a: runA.provider_used, b: runB.provider_used },
    { label: "fallback triggered", a: String(runA.fallback_triggered), b: String(runB.fallback_triggered) },
    { label: "provider ms", a: runA.timing.provider_ms, b: runB.timing.provider_ms },
    { label: "total ms", a: runA.timing.total_ms, b: runB.timing.total_ms },
    { label: "tool errors", a: runA.tool_calls.filter((t) => t.status !== "ok").length, b: runB.tool_calls.filter((t) => t.status !== "ok").length },
  ];
  const diffs = fields.filter((f) => f.a !== f.b);

  if (!diffs.length) {
    return (
      <div
        className="rounded-xl p-4 text-sm text-center"
        style={{ background: "#10b98111", border: "1px solid #10b98133", color: "#10b981" }}
      >
        No differences detected
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{ background: "#f59e0b11", border: "1px solid #f59e0b33" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
        {diffs.length} difference{diffs.length !== 1 ? "s" : ""} detected
      </p>
      {diffs.map((d) => (
        <div key={d.label} className="flex gap-4 text-sm">
          <span className="w-32 flex-shrink-0 font-medium" style={{ color: "var(--text-muted)" }}>
            {d.label}
          </span>
          <span>{String(d.a)}</span>
          <span style={{ color: "var(--text-muted)" }}>→</span>
          <span style={{ color: "#f59e0b" }}>{String(d.b)}</span>
        </div>
      ))}
    </div>
  );
}

function CompareContent() {
  const searchParams = useSearchParams();
  const initA = searchParams.get("a") ?? "";
  const initB = searchParams.get("b") ?? "";

  const [allRuns, setAllRuns] = useState<RunResult[]>([]);
  const [runA, setRunA] = useState<RunResult | null>(null);
  const [runB, setRunB] = useState<RunResult | null>(null);
  const [selectedA, setSelectedA] = useState(initA);
  const [selectedB, setSelectedB] = useState(initB);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listRuns(50).then((d) => setAllRuns(d.runs.slice().reverse())).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedA) { setRunA(null); return; }
    getRun(selectedA).then(setRunA).catch(() => setRunA(null));
  }, [selectedA]);

  useEffect(() => {
    if (!selectedB) { setRunB(null); return; }
    getRun(selectedB).then(setRunB).catch(() => setRunB(null));
  }, [selectedB]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compare Runs</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Select two runs to compare output drift and fallback behavior side by side.
        </p>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-2 gap-4">
        {(["A", "B"] as const).map((label) => {
          const selected = label === "A" ? selectedA : selectedB;
          const setSelected = label === "A" ? setSelectedA : setSelectedB;
          return (
            <div key={label}>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Run {label}
              </label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                <option value="">Select a run…</option>
                {allRuns.map((r) => (
                  <option key={r.request_id} value={r.request_id}>
                    [{r.output.severity}] {r.provider_used} — {r.output.summary.slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Diff summary */}
      {runA && runB && <DiffHighlighter runA={runA} runB={runB} />}

      {/* Side by side */}
      <div className="flex gap-4 items-start">
        {runA ? (
          <RunColumn run={runA} />
        ) : (
          <div
            className="flex-1 rounded-xl p-8 text-center text-sm"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
          >
            Select run A
          </div>
        )}
        {runB ? (
          <RunColumn run={runB} />
        ) : (
          <div
            className="flex-1 rounded-xl p-8 text-center text-sm"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
          >
            Select run B
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <CompareContent />
    </Suspense>
  );
}
