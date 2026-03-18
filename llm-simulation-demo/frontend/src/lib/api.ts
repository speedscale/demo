import type { ProviderInfo, RunRequest, RunResult } from "./types";

// Browser: use "" so requests go to /api/... on the same origin (proxied by the
// Next.js route handler at src/app/api/[...path]/route.ts).
// Server-side: call the backend directly using BACKEND_URL (a plain env var read
// at runtime, not baked at build time like NEXT_PUBLIC_* vars).
const API_BASE =
  typeof window !== "undefined"
    ? ""
    : process.env.BACKEND_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function runTask(req: RunRequest): Promise<RunResult> {
  return apiFetch<RunResult>("/api/run", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getProviders(): Promise<{ providers: ProviderInfo[]; default_provider: string }> {
  return apiFetch("/api/providers");
}

export async function getRun(id: string): Promise<RunResult> {
  return apiFetch<RunResult>(`/api/runs/${id}`);
}

export async function listRuns(limit = 20): Promise<{ runs: RunResult[]; total: number }> {
  return apiFetch(`/api/runs?limit=${limit}`);
}
