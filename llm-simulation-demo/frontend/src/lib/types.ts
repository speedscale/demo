export interface SimulationConfig {
  mode: "live" | "mock" | "chaos";
  inject_latency_ms: number;
  inject_status: number | null;
  inject_malformed_tool_json: boolean;
  fallback_provider: string | null;
}

export interface TicketInput {
  ticket_id: string;
  customer_tier: string;
  transcript: string;
}

export interface RunRequest {
  task: string;
  provider: string;
  model?: string;
  input: TicketInput;
  simulation: SimulationConfig;
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

export interface SimulationEcho {
  inject_latency_ms: number;
  inject_status: number | null;
  inject_malformed_tool_json: boolean;
}

export interface RunResult {
  request_id: string;
  provider_requested: string;
  provider_used: string;
  fallback_triggered: boolean;
  output: OutputEnvelope;
  tool_calls: ToolCallRecord[];
  timing: TimingInfo;
  simulation: SimulationEcho;
  error?: string;
}

export interface ProviderInfo {
  id: string;
  models: string[];
  default_model: string;
  configured: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
}
