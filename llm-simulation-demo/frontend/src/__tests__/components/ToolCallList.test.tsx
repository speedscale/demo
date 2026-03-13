import { render, screen } from "@testing-library/react";
import { ToolCallList } from "@/components/ToolCallList";
import type { ToolCallRecord } from "@/lib/types";

const okTool: ToolCallRecord = {
  name: "lookup_order",
  status: "ok",
  duration_ms: 84,
};

const errorTool: ToolCallRecord = {
  name: "lookup_policy",
  status: "error",
  duration_ms: 12,
  error: "HTTP 500",
};

const timeoutTool: ToolCallRecord = {
  name: "lookup_order",
  status: "timeout",
  duration_ms: 5000,
  error: "Request timed out",
};

describe("ToolCallList", () => {
  it("renders nothing when tools array is empty", () => {
    const { container } = render(<ToolCallList tools={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders tool name", () => {
    render(<ToolCallList tools={[okTool]} />);
    expect(screen.getByText("lookup_order")).toBeInTheDocument();
  });

  it("renders duration in ms", () => {
    render(<ToolCallList tools={[okTool]} />);
    expect(screen.getByText("84ms")).toBeInTheDocument();
  });

  it("renders error message for error status", () => {
    render(<ToolCallList tools={[errorTool]} />);
    expect(screen.getByText("HTTP 500")).toBeInTheDocument();
  });

  it("does not render error span when status is ok", () => {
    render(<ToolCallList tools={[okTool]} />);
    expect(screen.queryByText(/HTTP/)).not.toBeInTheDocument();
  });

  it("renders multiple tools", () => {
    render(<ToolCallList tools={[okTool, errorTool]} />);
    expect(screen.getByText("lookup_order")).toBeInTheDocument();
    expect(screen.getByText("lookup_policy")).toBeInTheDocument();
  });

  it("renders error message for timeout status", () => {
    render(<ToolCallList tools={[timeoutTool]} />);
    expect(screen.getByText("Request timed out")).toBeInTheDocument();
  });

  it("renders duration for all tools", () => {
    render(<ToolCallList tools={[okTool, errorTool]} />);
    expect(screen.getByText("84ms")).toBeInTheDocument();
    expect(screen.getByText("12ms")).toBeInTheDocument();
  });
});
