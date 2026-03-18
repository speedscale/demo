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
  tool_calls: ToolCallRecord[];
  timing: TimingInfo;
  error?: string;
}

export interface ProviderInfo {
  id: string;
  models: string[];
  default_model: string;
  configured: boolean;
}
