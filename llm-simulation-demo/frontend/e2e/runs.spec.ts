import { test, expect } from "@playwright/test";
import {
  mockListRuns,
  mockGetRun,
  MOCK_RUN_RESULT,
  MOCK_RUN_RESULT_B,
  MOCK_RUNS_LIST,
} from "./fixtures";

test.describe("Run History page (/runs)", () => {
  test("shows page heading and description", async ({ page }) => {
    await mockListRuns(page, { runs: [], total: 0 });
    await page.goto("/runs");

    await expect(page.getByRole("heading", { name: "Run History" })).toBeVisible();
    await expect(page.getByText("All ticket analyses from this session.")).toBeVisible();
  });

  test("shows 'No runs yet' when history is empty", async ({ page }) => {
    await mockListRuns(page, { runs: [], total: 0 });
    await page.goto("/runs");

    await expect(page.getByText("No runs yet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Analyze a ticket" })).toHaveAttribute("href", "/");
  });

  test("renders a row for each run", async ({ page }) => {
    await mockListRuns(page);
    await page.goto("/runs");

    // Runs are reversed on the page, so both request IDs should appear
    await expect(page.getByText(MOCK_RUN_RESULT.request_id)).toBeVisible();
    await expect(page.getByText(MOCK_RUN_RESULT_B.request_id)).toBeVisible();
  });

  test("each run row shows severity badge, provider, and timing", async ({ page }) => {
    await mockListRuns(page);
    await page.goto("/runs");

    // Provider names
    await expect(page.getByText("openai").first()).toBeVisible();
    await expect(page.getByText("anthropic")).toBeVisible();

    // Timing (ms suffix)
    await expect(page.getByText(`${MOCK_RUN_RESULT.timing.total_ms}ms`)).toBeVisible();
    await expect(page.getByText(`${MOCK_RUN_RESULT_B.timing.total_ms}ms`)).toBeVisible();
  });

  test("each run row has Trace and Compare links", async ({ page }) => {
    await mockListRuns(page);
    await page.goto("/runs");

    // There should be a Trace link pointing to /runs/:id for each run
    const traceLinks = page.getByRole("link", { name: "Trace" });
    await expect(traceLinks).toHaveCount(MOCK_RUNS_LIST.runs.length);

    // Spot-check first run's Trace href
    const firstTraceLink = traceLinks.first();
    const href = await firstTraceLink.getAttribute("href");
    expect(href).toMatch(/^\/runs\//);
  });

  test("Compare links include run id as query param", async ({ page }) => {
    await mockListRuns(page);
    await page.goto("/runs");

    const compareLinks = page.getByRole("link", { name: "Compare" });
    await expect(compareLinks).toHaveCount(MOCK_RUNS_LIST.runs.length);

    const firstCompareHref = await compareLinks.first().getAttribute("href");
    expect(firstCompareHref).toMatch(/^\/compare\?a=/);
  });

  test("navigating to a Trace link shows the trace page", async ({ page }) => {
    await mockListRuns(page);
    await mockGetRun(page);
    await page.goto("/runs");

    // Click the first Trace link
    await page.getByRole("link", { name: "Trace" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/runs/${MOCK_RUN_RESULT_B.request_id}|/runs/${MOCK_RUN_RESULT.request_id}`));
  });

  test("navigation bar links are present", async ({ page }) => {
    await mockListRuns(page, { runs: [], total: 0 });
    await page.goto("/runs");

    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Analyze" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "History" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Compare" })).toBeVisible();
  });
});

test.describe("Run Trace page (/runs/:id)", () => {
  test.beforeEach(async ({ page }) => {
    await mockGetRun(page);
  });

  test("shows request id, provider and model", async ({ page }) => {
    await page.goto(`/runs/${MOCK_RUN_RESULT.request_id}`);

    await expect(page.getByText(MOCK_RUN_RESULT.request_id)).toBeVisible();
    await expect(
      page.getByText(`${MOCK_RUN_RESULT.provider} / ${MOCK_RUN_RESULT.model}`)
    ).toBeVisible();
  });

  test("shows severity badge", async ({ page }) => {
    await page.goto(`/runs/${MOCK_RUN_RESULT.request_id}`);
    await expect(page.getByText(MOCK_RUN_RESULT.output.severity)).toBeVisible();
  });

  test("shows summary text", async ({ page }) => {
    await page.goto(`/runs/${MOCK_RUN_RESULT.request_id}`);
    await expect(page.getByText(MOCK_RUN_RESULT.output.summary)).toBeVisible();
  });

  test("shows recommended action", async ({ page }) => {
    await page.goto(`/runs/${MOCK_RUN_RESULT.request_id}`);
    await expect(page.getByText(MOCK_RUN_RESULT.output.recommended_action)).toBeVisible();
  });

  test("shows tool call names", async ({ page }) => {
    await page.goto(`/runs/${MOCK_RUN_RESULT.request_id}`);
    await expect(page.getByText("lookup_order")).toBeVisible();
    await expect(page.getByText("lookup_policy")).toBeVisible();
  });

  test("shows provider and total timing stats", async ({ page }) => {
    await page.goto(`/runs/${MOCK_RUN_RESULT.request_id}`);
    await expect(page.getByText(String(MOCK_RUN_RESULT.timing.provider_ms))).toBeVisible();
    await expect(page.getByText(String(MOCK_RUN_RESULT.timing.total_ms))).toBeVisible();
  });
});
