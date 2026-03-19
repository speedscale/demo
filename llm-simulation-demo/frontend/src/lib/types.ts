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
  provider: string;
  model: string;
  output: OutputEnvelope;
  steps: LLMStep[];
  tool_calls: ToolCallRecord[];
  timing: TimingInfo;
  total_tokens: number;
  cost_usd: number;
  error?: string;
}

export interface ProviderInfo {
  id: string;
  models: string[];
  default_model: string;
  configured: boolean;
}
