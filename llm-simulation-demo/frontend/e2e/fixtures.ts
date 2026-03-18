import type { Page, Route } from "@playwright/test";

export const MOCK_PROVIDERS = {
  providers: [
    { id: "openai", configured: true, models: ["gpt-4o", "gpt-4o-mini"] },
    { id: "anthropic", configured: false, models: ["claude-3-5-sonnet-20241022"] },
    { id: "gemini", configured: false, models: ["gemini-1.5-pro"] },
  ],
  default_provider: "openai",
};

export const MOCK_RUN_RESULT = {
  request_id: "req-abc123",
  provider: "openai",
  model: "gpt-4o",
  output: {
    severity: "high",
    summary: "Payment processing failure affecting all customers since the 14:00 UTC deploy.",
    recommended_action: "Escalate to engineering team immediately and consider rolling back the 14:00 UTC deployment.",
  },
  tool_calls: [
    {
      name: "lookup_order",
      status: "ok",
      result: { order_id: "ORD-1234", status: "pending", amount: "99.99" },
      duration_ms: 45,
    },
    {
      name: "lookup_policy",
      status: "ok",
      result: { policy: "standard", max_refund_days: "30" },
      duration_ms: 32,
    },
  ],
  timing: {
    provider_ms: 1234,
    total_ms: 1312,
  },
};

export const MOCK_RUN_RESULT_B = {
  request_id: "req-def456",
  provider: "anthropic",
  model: "claude-3-5-sonnet-20241022",
  output: {
    severity: "critical",
    summary: "Payment processing failure affecting all customers since the 14:00 UTC deploy.",
    recommended_action: "Immediate rollback required — all payment transactions are failing.",
  },
  tool_calls: [
    {
      name: "lookup_order",
      status: "error",
      error: "Order not found",
      duration_ms: 12,
    },
  ],
  timing: {
    provider_ms: 2100,
    total_ms: 2200,
  },
};

export const MOCK_RUNS_LIST = {
  runs: [MOCK_RUN_RESULT, MOCK_RUN_RESULT_B],
  total: 2,
};

/** Mock the /api/providers endpoint. */
export async function mockProviders(page: Page, data = MOCK_PROVIDERS) {
  await page.route("**/api/providers", (route: Route) =>
    route.fulfill({ json: data })
  );
}

/** Mock the POST /api/run endpoint with a single result. */
export async function mockRunTask(page: Page, result = MOCK_RUN_RESULT) {
  await page.route("**/api/run", (route: Route) =>
    route.fulfill({ json: result })
  );
}

/** Mock GET /api/runs list endpoint. */
export async function mockListRuns(page: Page, data = MOCK_RUNS_LIST) {
  await page.route("**/api/runs?**", (route: Route) =>
    route.fulfill({ json: data })
  );
}

/** Mock GET /api/runs/:id endpoint, keyed by request_id. */
export async function mockGetRun(
  page: Page,
  runs: typeof MOCK_RUN_RESULT[] = [MOCK_RUN_RESULT, MOCK_RUN_RESULT_B]
) {
  await page.route("**/api/runs/*", (route: Route) => {
    const url = route.request().url();
    const id = url.split("/api/runs/")[1].split("?")[0];
    const match = runs.find((r) => r.request_id === id);
    if (match) return route.fulfill({ json: match });
    return route.fulfill({ status: 404, body: "not found" });
  });
}
