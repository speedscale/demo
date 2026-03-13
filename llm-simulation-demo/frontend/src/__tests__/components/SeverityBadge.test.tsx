import { render, screen } from "@testing-library/react";
import { SeverityBadge } from "@/components/SeverityBadge";

describe("SeverityBadge", () => {
  const SEVERITIES = ["low", "medium", "high", "critical"] as const;

  it.each(SEVERITIES)("renders %s severity text", (severity) => {
    render(<SeverityBadge severity={severity} />);
    expect(screen.getByText(severity)).toBeInTheDocument();
  });

  it("renders unknown severity without crashing", () => {
    render(<SeverityBadge severity="unknown" />);
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("applies uppercase text via CSS class", () => {
    render(<SeverityBadge severity="high" />);
    const el = screen.getByText("high");
    expect(el).toHaveClass("uppercase");
  });

  it("uses the correct color for high severity", () => {
    render(<SeverityBadge severity="high" />);
    const el = screen.getByText("high");
    // high maps to #f97316 (orange)
    expect(el).toHaveStyle({ color: "#f97316" });
  });

  it("uses the correct color for critical severity", () => {
    render(<SeverityBadge severity="critical" />);
    const el = screen.getByText("critical");
    expect(el).toHaveStyle({ color: "#ef4444" });
  });

  it("uses the correct color for low severity", () => {
    render(<SeverityBadge severity="low" />);
    const el = screen.getByText("low");
    expect(el).toHaveStyle({ color: "#10b981" });
  });

  it("uses fallback grey color for unknown severities", () => {
    render(<SeverityBadge severity="n/a" />);
    const el = screen.getByText("n/a");
    expect(el).toHaveStyle({ color: "#9ca3af" });
  });
});
