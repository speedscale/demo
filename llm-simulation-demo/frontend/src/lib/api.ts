import type { ProviderInfo, RunRequest, RunResult, Scenario } from "./types";

const API_BASE =
  typeof window !== "undefined"
    ? ""
    : process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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

export async function runScenario(id: string): Promise<RunResult> {
  return apiFetch<RunResult>(`/api/scenarios/${id}/run`, { method: "POST" });
}

export async function getProviders(): Promise<{ providers: ProviderInfo[]; default_provider: string }> {
  return apiFetch("/api/providers");
}

export async function getScenarios(): Promise<{ scenarios: Scenario[] }> {
  return apiFetch("/api/scenarios");
}

export async function getRun(id: string): Promise<RunResult> {
  return apiFetch<RunResult>(`/api/runs/${id}`);
}

export async function listRuns(limit = 20): Promise<{ runs: RunResult[]; total: number }> {
  return apiFetch(`/api/runs?limit=${limit}`);
}
