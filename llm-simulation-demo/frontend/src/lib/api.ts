import type { ProviderInfo, RunRequest, RunResult, StreamEvent } from "./types";

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

export async function* streamTask(req: RunRequest): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${API_BASE}/api/run/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API /api/run/stream → ${res.status}: ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      try {
        yield JSON.parse(dataLine.slice(6)) as StreamEvent;
      } catch {
        // skip malformed event
      }
    }
  }
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
