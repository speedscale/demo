import { runTask, getProviders, getRun, listRuns } from "@/lib/api";
import type { RunRequest } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetch = (body: unknown, status = 200) =>
  jest.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    statusText: "OK",
  });

const GOOD_RESULT = {
  request_id: "req_test",
  provider: "openai",
  model: "gpt-4o-mini",
  output: { summary: "Test", severity: "low", recommended_action: "None" },
  tool_calls: [],
  timing: { provider_ms: 100, total_ms: 120 },
};

const GOOD_REQUEST: RunRequest = {
  provider: "openai",
  input: { ticket_id: "INC-1", customer_tier: "enterprise", transcript: "Test" },
};

// ---------------------------------------------------------------------------
// runTask
// ---------------------------------------------------------------------------

describe("runTask", () => {
  afterEach(() => jest.restoreAllMocks());

  it("POSTs to /api/run and returns parsed result", async () => {
    global.fetch = mockFetch(GOOD_RESULT);
    const result = await runTask(GOOD_REQUEST);
    expect(result.request_id).toBe("req_test");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/run"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends Content-Type: application/json", async () => {
    global.fetch = mockFetch(GOOD_RESULT);
    await runTask(GOOD_REQUEST);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("serializes the request body as JSON", async () => {
    global.fetch = mockFetch(GOOD_RESULT);
    await runTask(GOOD_REQUEST);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const parsed = JSON.parse(init.body as string);
    expect(parsed.provider).toBe("openai");
    expect(parsed.input.ticket_id).toBe("INC-1");
  });

  it("throws on non-ok response", async () => {
    global.fetch = mockFetch({ detail: "not found" }, 404);
    await expect(runTask(GOOD_REQUEST)).rejects.toThrow();
  });

  it("throws on 500 response", async () => {
    global.fetch = mockFetch({ detail: "server error" }, 500);
    await expect(runTask(GOOD_REQUEST)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getProviders
// ---------------------------------------------------------------------------

describe("getProviders", () => {
  afterEach(() => jest.restoreAllMocks());

  const PROVIDERS_RESPONSE = {
    providers: [
      { id: "openai", models: ["gpt-4o"], default_model: "gpt-4o-mini", configured: true },
    ],
    default_provider: "openai",
  };

  it("GETs /api/providers", async () => {
    global.fetch = mockFetch(PROVIDERS_RESPONSE);
    const data = await getProviders();
    expect(data.providers).toHaveLength(1);
    expect(data.default_provider).toBe("openai");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/providers"),
      expect.any(Object)
    );
  });

  it("throws on non-ok response", async () => {
    global.fetch = mockFetch({}, 503);
    await expect(getProviders()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getRun
// ---------------------------------------------------------------------------

describe("getRun", () => {
  afterEach(() => jest.restoreAllMocks());

  it("GETs /api/runs/{id}", async () => {
    global.fetch = mockFetch(GOOD_RESULT);
    const result = await getRun("req_test");
    expect(result.request_id).toBe("req_test");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/runs/req_test"),
      expect.any(Object)
    );
  });

  it("throws on 404", async () => {
    global.fetch = mockFetch({ detail: "not found" }, 404);
    await expect(getRun("req_missing")).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// listRuns
// ---------------------------------------------------------------------------

describe("listRuns", () => {
  afterEach(() => jest.restoreAllMocks());

  it("GETs /api/runs with default limit", async () => {
    global.fetch = mockFetch({ runs: [GOOD_RESULT], total: 1 });
    const data = await listRuns();
    expect(data.runs).toHaveLength(1);
    expect(data.total).toBe(1);
  });

  it("passes limit query param", async () => {
    global.fetch = mockFetch({ runs: [], total: 0 });
    await listRuns(5);
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("limit=5");
  });
});
