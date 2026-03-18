import { test, expect } from "@playwright/test";
import {
  mockProviders,
  mockRunTask,
  MOCK_RUN_RESULT,
  MOCK_PROVIDERS,
} from "./fixtures";

test.describe("Home page — Ticket Triage", () => {
  test.beforeEach(async ({ page }) => {
    await mockProviders(page);
    await mockRunTask(page);
    await page.goto("/");
  });

  test("renders page title and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Ticket Triage" })).toBeVisible();
    await expect(page.getByText("AI-powered analysis for support tickets.")).toBeVisible();
  });

  test("renders navigation links", async ({ page }) => {
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Analyze" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "History" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Compare" })).toBeVisible();
  });

  test("nav brand reads 'Ticket Triage'", async ({ page }) => {
    await expect(page.locator("nav").getByText("Ticket Triage")).toBeVisible();
  });

  test("provider select is populated from API", async ({ page }) => {
    const providerSelect = page.locator("select").first();
    for (const p of MOCK_PROVIDERS.providers) {
      await expect(providerSelect.locator(`option[value="${p.id}"]`)).toHaveCount(1);
    }
    await expect(providerSelect).toHaveValue(MOCK_PROVIDERS.default_provider);
  });

  test("model select shows 'default' option plus provider models", async ({ page }) => {
    const modelSelect = page.locator("select").nth(1);
    await expect(modelSelect.locator("option[value='']")).toHaveCount(1);
    await expect(modelSelect.locator("option[value='gpt-4o']")).toHaveCount(1);
    await expect(modelSelect.locator("option[value='gpt-4o-mini']")).toHaveCount(1);
  });

  test("changing provider resets model and loads new models", async ({ page }) => {
    const providerSelect = page.locator("select").first();
    const modelSelect = page.locator("select").nth(1);

    // Switch to anthropic
    await providerSelect.selectOption("anthropic");
    await expect(modelSelect).toHaveValue("");
    await expect(modelSelect.locator("option[value='claude-3-5-sonnet-20241022']")).toHaveCount(1);
  });

  test("ticket form shows ID input, tier select, and transcript textarea", async ({ page }) => {
    await expect(page.getByPlaceholder("INC-4201")).toBeVisible();
    const tierSelect = page.locator("select").nth(2);
    await expect(tierSelect).toBeVisible();
    await expect(page.locator("textarea")).toBeVisible();
  });

  test("first sample ticket is pre-loaded", async ({ page }) => {
    await expect(page.getByPlaceholder("INC-4201")).toHaveValue("INC-4201");
    await expect(page.locator("textarea")).toContainText("tax recalculation error");
  });

  test("sample ticket buttons switch the ticket content", async ({ page }) => {
    // Click sample ticket #2
    await page.getByRole("button", { name: "#2" }).click();
    await expect(page.getByPlaceholder("INC-4201")).toHaveValue("INC-4202");
    await expect(page.locator("textarea")).toContainText("Payment declined");

    // Click sample ticket #3
    await page.getByRole("button", { name: "#3" }).click();
    await expect(page.getByPlaceholder("INC-4201")).toHaveValue("INC-4203");
    await expect(page.locator("textarea")).toContainText("Order tracking page");
  });

  test("active sample ticket button is highlighted", async ({ page }) => {
    // Button #1 is active by default — check it has accent background style
    const btn1 = page.getByRole("button", { name: "#1" });
    await expect(btn1).toHaveCSS("color", "rgb(255, 255, 255)");

    // Click #2, then #2 should be highlighted
    await page.getByRole("button", { name: "#2" }).click();
    await expect(page.getByRole("button", { name: "#2" })).toHaveCSS("color", "rgb(255, 255, 255)");
  });

  test("all 5 sample ticket buttons are rendered", async ({ page }) => {
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByRole("button", { name: `#${i}` })).toBeVisible();
    }
  });

  test("shows placeholder when no result yet", async ({ page }) => {
    await expect(
      page.getByText("Select a ticket and click Analyze Ticket to see the AI analysis here.")
    ).toBeVisible();
  });

  test("Analyze Ticket button triggers API call and shows result", async ({ page }) => {
    await page.getByRole("button", { name: "Analyze Ticket" }).click();

    // Result panel should appear with mock data
    await expect(page.getByText(MOCK_RUN_RESULT.output.summary)).toBeVisible();
    await expect(
      page.getByText(MOCK_RUN_RESULT.output.recommended_action)
    ).toBeVisible();
    await expect(page.getByText(MOCK_RUN_RESULT.request_id)).toBeVisible();
  });

  test("result panel shows severity badge", async ({ page }) => {
    await page.getByRole("button", { name: "Analyze Ticket" }).click();
    await expect(page.getByText("high", { exact: true })).toBeVisible();
  });

  test("result panel shows provider, model, and timing", async ({ page }) => {
    await page.getByRole("button", { name: "Analyze Ticket" }).click();
    await expect(
      page.getByText(`${MOCK_RUN_RESULT.provider} · ${MOCK_RUN_RESULT.model} · ${MOCK_RUN_RESULT.timing.total_ms}ms`)
    ).toBeVisible();
  });

  test("result panel shows tool call data (Order Details)", async ({ page }) => {
    await page.getByRole("button", { name: "Analyze Ticket" }).click();
    await expect(page.getByText("Order Details")).toBeVisible();
  });

  test("result panel shows Full trace and Compare links", async ({ page }) => {
    await page.getByRole("button", { name: "Analyze Ticket" }).click();
    await expect(page.getByRole("link", { name: "Full trace" })).toHaveAttribute(
      "href",
      `/runs/${MOCK_RUN_RESULT.request_id}`
    );
    await expect(page.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      `/compare?a=${MOCK_RUN_RESULT.request_id}`
    );
  });

  test("Analyze Ticket button shows loading state while fetching", async ({ page }) => {
    // Delay the API response so we can observe the loading text
    await page.route("**/api/run", async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({ json: MOCK_RUN_RESULT });
    });

    const btn = page.getByRole("button", { name: /Analyze/ });
    await btn.click();
    await expect(page.getByRole("button", { name: "Analyzing…" })).toBeVisible();
    await expect(page.getByText("Calling provider…")).toBeVisible();
    // After response the result shows
    await expect(page.getByText(MOCK_RUN_RESULT.output.summary)).toBeVisible();
  });

  test("shows error message when API returns an error", async ({ page }) => {
    await page.route("**/api/run", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );

    await page.getByRole("button", { name: "Analyze Ticket" }).click();
    await expect(page.getByText(/API.*500/)).toBeVisible();
  });

  test("buttons are disabled while analyzing", async ({ page }) => {
    await page.route("**/api/run", async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.fulfill({ json: MOCK_RUN_RESULT });
    });

    await page.getByRole("button", { name: "Analyze Ticket" }).click();
    await expect(page.getByRole("button", { name: "Analyzing…" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Analyze All" })).toBeDisabled();
  });

  test("Analyze All button is present", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Analyze All" })).toBeVisible();
  });

  test("Analyze All shows progress bar and batch results", async ({ page }) => {
    // Only openai is configured so 5 tickets × 1 provider = 5 calls
    await page.getByRole("button", { name: "Analyze All" }).click();

    // Progress header should appear
    await expect(page.getByText(/Analyzing…|Complete/)).toBeVisible();

    // Wait for all calls to complete
    await expect(page.getByText(/Complete — 5 succeeded/)).toBeVisible({ timeout: 10_000 });

    // Batch cells for each ticket should appear
    for (const id of ["INC-4201", "INC-4202", "INC-4203", "INC-4204", "INC-4205"]) {
      await expect(page.getByText(id)).toBeVisible();
    }

    // "View full history" link appears after completion
    await expect(page.getByRole("link", { name: "View full history →" })).toBeVisible();
  });
});
