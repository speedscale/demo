export interface TicketInput {
  ticket_id: string;
  customer_tier: string;
  transcript: string;
}

export interface RunRequest {
  provider: string;
  model?: string;
  input: TicketInput;
}

export interface OutputEnvelope {
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  recommended_action: string;
  root_cause?: string;
  response_draft?: string;
}

export interface LLMStep {
  name: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  duration_ms: number;
}

export interface ToolCallRecord {
  name: string;
  status: "ok" | "error" | "timeout";
  duration_ms: number;
  result?: unknown;
  error?: string;
}

export interface TimingInfo {
  provider_ms: number;
  total_ms: number;
}

export interface RunResult {
  request_id: string;
  ticket_id?: string;
  provider: string;
  model: string;
  output: OutputEnvelope;
  steps: LLMStep[];
  tool_calls: ToolCallRecord[];
  timing: TimingInfo;
  total_tokens: number;
  cost_usd: number;
  mocked?: boolean;
  error?: string;
}

export interface ProviderInfo {
  id: string;
  models: string[];
  default_model: string;
  configured: boolean;
}

// SSE event types from /api/run/stream
export type StreamEvent =
  | { type: "tools"; tool_calls: ToolCallRecord[] }
  | { type: "step"; name: string; data: Record<string, unknown>; prompt_tokens: number; completion_tokens: number; cost_usd: number; duration_ms: number; mocked?: boolean }
  | { type: "complete"; request_id: string; total_tokens: number; cost_usd: number; mocked?: boolean }
  | { type: "error"; message: string };

// Per-ticket streaming state accumulated on the frontend
export interface TicketRunState {
  status: "running" | "done" | "error";
  provider: string;
  model: string;
  severity?: string;
  summary?: string;
  root_cause?: string;
  recommended_action?: string;
  response_draft?: string;
  steps: LLMStep[];
  tool_calls: ToolCallRecord[];
  request_id?: string;
  total_tokens: number;
  cost_usd: number;
  mocked?: boolean;
  error?: string;
  currentStep?: "triage" | "analysis" | "response";
}
