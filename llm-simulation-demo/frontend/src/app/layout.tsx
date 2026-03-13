import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Simulation Demo",
  description: "Validate AI system runtime behavior across providers with Speedscale",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-8">
            <span className="font-bold text-lg tracking-tight" style={{ color: "var(--accent)" }}>
              LLM Simulation
            </span>
            <div className="flex gap-6 text-sm" style={{ color: "var(--text-muted)" }}>
              <a href="/" className="hover:text-white transition-colors">Demo</a>
              <a href="/compare" className="hover:text-white transition-colors">Compare</a>
              <a href="/runs" className="hover:text-white transition-colors">Runs</a>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
