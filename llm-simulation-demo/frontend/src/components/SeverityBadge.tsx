"use client";

const COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const color = COLORS[severity] ?? "#9ca3af";
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {severity}
    </span>
  );
}
