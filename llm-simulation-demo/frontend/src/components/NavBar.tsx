"use client";

import { useState, useEffect } from "react";

function fmt$(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(4)}`;
}

export function NavBar() {
  const [sessionCost, setSessionCost] = useState(0);
  const [sessionTokens, setSessionTokens] = useState(0);

  useEffect(() => {
    function onRunComplete(e: Event) {
      const { cost, tokens } = (e as CustomEvent<{ cost: number; tokens: number }>).detail;
      setSessionCost((prev) => prev + (cost ?? 0));
      setSessionTokens((prev) => prev + (tokens ?? 0));
    }
    window.addEventListener("run-complete", onRunComplete);
    return () => window.removeEventListener("run-complete", onRunComplete);
  }, []);

  return (
    <nav className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-8">
        <div className="flex items-center gap-8">
          <span className="font-bold text-lg tracking-tight" style={{ color: "var(--accent)" }}>
            Ticket Triage
          </span>
          <div className="flex gap-6 text-sm" style={{ color: "var(--text-muted)" }}>
            <a href="/" className="hover:text-white transition-colors">Analyze</a>
            <a href="/runs" className="hover:text-white transition-colors">History</a>
            <a href="/compare" className="hover:text-white transition-colors">Compare</a>
          </div>
        </div>

        {/* Live session cost meter */}
        <div className="flex items-center gap-2">
          {sessionCost > 0 ? (
            <>
              <div
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: "#ef444411", border: "1px solid #ef444433" }}
              >
                <span style={{ color: "var(--text-muted)" }}>Session cost</span>
                <span className="font-mono font-bold" style={{ color: "#ef4444" }}>{fmt$(sessionCost)}</span>
                <span style={{ color: "var(--text-muted)" }}>·</span>
                <span className="font-mono" style={{ color: "var(--text-muted)" }}>{sessionTokens.toLocaleString()} tok</span>
              </div>
              <div
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: "#10b98111", border: "1px solid #10b98133" }}
              >
                <span style={{ color: "var(--text-muted)" }}>with simulation</span>
                <span className="font-mono font-bold" style={{ color: "#10b981" }}>$0.00</span>
              </div>
            </>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Session cost: <span className="font-mono">$0.00</span>
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
