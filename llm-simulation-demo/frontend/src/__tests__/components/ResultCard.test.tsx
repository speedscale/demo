import { render, screen } from "@testing-library/react";
import { ResultCard } from "@/components/ResultCard";
import type { RunResult } from "@/lib/types";

const baseResult: RunResult = {
  request_id: "req_abc123",
  provider_requested: "anthropic",
  provider_used: "anthropic",
  fallback_triggered: false,
  output: {
    summary: "Checkout fails after tax rule change.",
    severity: "high",
    recommended_action: "Rollback tax rule and notify support.",
  },
  tool_calls: [
    { name: "lookup_order", status: "ok", duration_ms: 84 },
    { name: "lookup_policy", status: "ok", duration_ms: 22 },
  ],
  timing: { provider_ms: 1200, total_ms: 1450 },
  simulation: {
    inject_latency_ms: 0,
    inject_status: null,
    inject_malformed_tool_json: false,
  },
};

describe("ResultCard", () => {
  describe("basic rendering", () => {
    it("renders the summary text", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.getByText("Checkout fails after tax rule change.")).toBeInTheDocument();
    });

    it("renders the recommended action", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.getByText("Rollback tax rule and notify support.")).toBeInTheDocument();
    });

    it("renders the request ID", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.getByText("req_abc123")).toBeInTheDocument();
    });

    it("renders the provider used", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.getByText("anthropic")).toBeInTheDocument();
    });

    it("renders provider_ms timing", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.getByText("1200")).toBeInTheDocument();
    });

    it("renders total_ms timing", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.getByText("1450")).toBeInTheDocument();
    });
  });

  describe("severity badge", () => {
    it("renders severity badge with correct text", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.getByText("high")).toBeInTheDocument();
    });

    it("reflects different severities", () => {
      const low = { ...baseResult, output: { ...baseResult.output, severity: "low" as const } };
      render(<ResultCard result={low} />);
      expect(screen.getByText("low")).toBeInTheDocument();
    });
  });

  describe("fallback badge", () => {
    it("does NOT show fallback badge when fallback_triggered is false", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.queryByText("Fallback triggered")).not.toBeInTheDocument();
    });

    it("shows fallback badge when fallback_triggered is true", () => {
      const withFallback: RunResult = {
        ...baseResult,
        fallback_triggered: true,
        provider_requested: "anthropic",
        provider_used: "openai",
      };
      render(<ResultCard result={withFallback} />);
      expect(screen.getByText("Fallback triggered")).toBeInTheDocument();
    });
  });

  describe("provider error badge", () => {
    it("does NOT show error badge when error is absent", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.queryByText("Provider error")).not.toBeInTheDocument();
    });

    it("shows error badge when error is present", () => {
      const withError: RunResult = { ...baseResult, error: "anthropic rate limited" };
      render(<ResultCard result={withError} />);
      expect(screen.getByText("Provider error")).toBeInTheDocument();
    });
  });

  describe("tool calls", () => {
    it("renders tool call names", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.getByText("lookup_order")).toBeInTheDocument();
      expect(screen.getByText("lookup_policy")).toBeInTheDocument();
    });

    it("does not render tool calls section when list is empty", () => {
      const noTools: RunResult = { ...baseResult, tool_calls: [] };
      render(<ResultCard result={noTools} />);
      expect(screen.queryByText("lookup_order")).not.toBeInTheDocument();
    });

    it("renders error details for failed tool calls", () => {
      const withErrorTool: RunResult = {
        ...baseResult,
        tool_calls: [{ name: "lookup_order", status: "error", duration_ms: 5, error: "HTTP 500" }],
      };
      render(<ResultCard result={withErrorTool} />);
      expect(screen.getByText("HTTP 500")).toBeInTheDocument();
    });
  });
});
