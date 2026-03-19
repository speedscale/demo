import { render, screen } from "@testing-library/react";
import { ResultCard } from "@/components/ResultCard";
import type { RunResult } from "@/lib/types";

const baseResult: RunResult = {
  request_id: "req_abc123",
  provider: "anthropic",
  model: "claude-haiku-4-5",
  output: {
    summary: "Checkout fails after tax rule change.",
    severity: "high",
    recommended_action: "Rollback tax rule and notify support.",
  },
  steps: [],
  tool_calls: [
    { name: "lookup_order", status: "ok", duration_ms: 84 },
    { name: "lookup_policy", status: "ok", duration_ms: 22 },
  ],
  timing: { provider_ms: 1200, total_ms: 1450 },
  total_tokens: 0,
  cost_usd: 0,
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

    it("renders provider and model", () => {
      render(<ResultCard result={baseResult} />);
      expect(screen.getByText(/anthropic/)).toBeInTheDocument();
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
