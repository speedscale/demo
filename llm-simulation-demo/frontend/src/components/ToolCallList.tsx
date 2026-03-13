"use client";

import type { ToolCallRecord } from "@/lib/types";

function statusColor(status: string) {
  if (status === "ok") return "#10b981";
  if (status === "error") return "#ef4444";
  return "#f59e0b";
}

export function ToolCallList({ tools }: { tools: ToolCallRecord[] }) {
  if (!tools.length) return null;
  return (
    <div className="space-y-2">
      {tools.map((t, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: statusColor(t.status) }}
            />
            <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
              {t.name}
            </span>
            {t.error && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#ef444422", color: "#ef4444" }}>
                {t.error}
              </span>
            )}
          </div>
          <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
            {t.duration_ms}ms
          </span>
        </div>
      ))}
    </div>
  );
}
