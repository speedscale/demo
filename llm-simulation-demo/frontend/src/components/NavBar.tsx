"use client";

import { useState, useEffect } from "react";

function fmt$(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function NavBar() {
  const [liveCost, setLiveCost] = useState(0);
  const [savedCost, setSavedCost] = useState(0);

  useEffect(() => {
    function onRunComplete(e: Event) {
      const { cost, mocked } = (e as CustomEvent<{ cost: number; tokens: number; mocked?: boolean }>).detail;
      if (mocked) {
        setSavedCost((prev) => prev + (cost ?? 0));
      } else {
        setLiveCost((prev) => prev + (cost ?? 0));
      }
    }
    window.addEventListener("run-complete", onRunComplete);
    return () => window.removeEventListener("run-complete", onRunComplete);
  }, []);

  return (
    <nav className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-8">
        <div className="flex items-center gap-8">
          <span className="font-bold text-lg tracking-tight" style={{ color: "var(--accent)" }}>
            Support Triage
          </span>
          <div className="flex gap-6 text-sm" style={{ color: "var(--text-muted)" }}>
            <a href="/" className="hover:text-white transition-colors">Analyze</a>
            <a href="/runs" className="hover:text-white transition-colors">History</a>
            <a href="/compare" className="hover:text-white transition-colors">Compare</a>
            <a href="/costs" className="hover:text-white transition-colors">Costs</a>
          </div>
        </div>

        {/* Compact session badges — live spend (red) vs simulated savings (green) */}
        <a
          href="/costs"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
          title="Click for full cost breakdown"
        >
          <span
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
            style={{
              background: liveCost > 0 ? "#ef444411" : "var(--surface2)",
              border: `1px solid ${liveCost > 0 ? "#ef444433" : "var(--border)"}`,
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Live</span>
            <span className="font-mono font-bold" style={{ color: liveCost > 0 ? "#ef4444" : "var(--text-muted)" }}>
              {fmt$(liveCost)}
            </span>
          </span>
          <span
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
            style={{
              background: savedCost > 0 ? "#10b98111" : "var(--surface2)",
              border: `1px solid ${savedCost > 0 ? "#10b98133" : "var(--border)"}`,
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Saved</span>
            <span className="font-mono font-bold" style={{ color: savedCost > 0 ? "#10b981" : "var(--text-muted)" }}>
              {fmt$(savedCost)}
            </span>
          </span>
        </a>
      </div>
    </nav>
  );
}
