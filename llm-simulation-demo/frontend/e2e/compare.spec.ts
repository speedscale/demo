import { test, expect } from "@playwright/test";
import {
  mockListRuns,
  mockGetRun,
  MOCK_RUN_RESULT,
  MOCK_RUN_RESULT_B,
} from "./fixtures";

test.describe("Compare page (/compare)", () => {
  test("shows page heading and description", async ({ page }) => {
    await mockListRuns(page, { runs: [], total: 0 });
    await page.goto("/compare");

    await expect(page.getByRole("heading", { name: "Compare Runs" })).toBeVisible();
    await expect(
      page.getByText("Select two runs to compare outputs side by side.")
    ).toBeVisible();
  });

  test("renders Run A and Run B selects", async ({ page }) => {
    await mockListRuns(page, { runs: [], total: 0 });
    await page.goto("/compare");

    await expect(page.getByLabel("Run A")).toBeVisible();
    await expect(page.getByLabel("Run B")).toBeVisible();
  });

  test("Auto Compare button is visible", async ({ page }) => {
    await mockListRuns(page, { runs: [], total: 0 });
    await page.goto("/compare");

    await expect(page.getByRole("button", { name: "Auto Compare" })).toBeVisible();
  });

  test("Auto Compare button is disabled when fewer than 2 runs", async ({ page }) => {
    await mockListRuns(page, { runs: [MOCK_RUN_RESULT], total: 1 });
    await page.goto("/compare");

    await expect(page.getByRole("button", { name: "Auto Compare" })).toBeDisabled();
  });

  test("Auto Compare button is enabled when 2+ runs exist", async ({ page }) => {
    await mockListRuns(page);
    await page.goto("/compare");

    await expect(page.getByRole("button", { name: "Auto Compare" })).toBeEnabled();
  });

  test("run dropdowns are populated with available runs", async ({ page }) => {
    await mockListRuns(page);
    await page.goto("/compare");

    const selectA = page.getByLabel("Run A");
    await expect(
      selectA.locator(`option[value="${MOCK_RUN_RESULT.request_id}"]`)
    ).toHaveCount(1);
    await expect(
      selectA.locator(`option[value="${MOCK_RUN_RESULT_B.request_id}"]`)
    ).toHaveCount(1);
  });

  test("empty state placeholders shown when no runs selected", async ({ page }) => {
    await mockListRuns(page, { runs: [], total: 0 });
    await page.goto("/compare");

    await expect(page.getByText("Select run A")).toBeVisible();
    await expect(page.getByText("Select run B")).toBeVisible();
  });

  test("selecting run A loads and displays that run", async ({ page }) => {
    await mockListRuns(page);
    await mockGetRun(page);
    await page.goto("/compare");

    await page.getByLabel("Run A").selectOption(MOCK_RUN_RESULT.request_id);

    await expect(page.getByText(MOCK_RUN_RESULT.output.summary)).toBeVisible();
    await expect(
      page.getByText(`${MOCK_RUN_RESULT.provider} / ${MOCK_RUN_RESULT.model}`)
    ).toBeVisible();
  });

  test("selecting both runs shows diff highlighter", async ({ page }) => {
    await mockListRuns(page);
    await mockGetRun(page);
    await page.goto("/compare");

    await page.getByLabel("Run A").selectOption(MOCK_RUN_RESULT.request_id);
    await page.getByLabel("Run B").selectOption(MOCK_RUN_RESULT_B.request_id);

    // The two runs differ in severity, provider, model, and timing — diff section should appear
    await expect(
      page.getByText(/differences detected|No differences detected/)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("diff shows severity difference between the two runs", async ({ page }) => {
    await mockListRuns(page);
    await mockGetRun(page);
    await page.goto("/compare");

    await page.getByLabel("Run A").selectOption(MOCK_RUN_RESULT.request_id);
    await page.getByLabel("Run B").selectOption(MOCK_RUN_RESULT_B.request_id);

    // Severity differs: high → critical
    await expect(page.getByText("severity")).toBeVisible();
    await expect(page.getByText(MOCK_RUN_RESULT.output.severity)).toBeVisible();
    await expect(page.getByText(MOCK_RUN_RESULT_B.output.severity)).toBeVisible();
  });

  test("Auto Compare pre-selects two runs", async ({ page }) => {
    await mockListRuns(page);
    await mockGetRun(page);
    await page.goto("/compare");

    await page.getByRole("button", { name: "Auto Compare" }).click();

    // Both selects should have a non-empty value after auto compare
    const valueA = await page.getByLabel("Run A").inputValue();
    const valueB = await page.getByLabel("Run B").inputValue();
    expect(valueA).not.toBe("");
    expect(valueB).not.toBe("");
    expect(valueA).not.toBe(valueB);
  });

  test("navigation bar links are present", async ({ page }) => {
    await mockListRuns(page, { runs: [], total: 0 });
    await page.goto("/compare");

    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Analyze" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "History" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Compare" })).toBeVisible();
  });

  test("compare page is reachable via History nav link from home", async ({ page }) => {
    await mockListRuns(page, { runs: [], total: 0 });
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "Compare" }).click();
    await expect(page).toHaveURL(/\/compare/);
    await expect(page.getByRole("heading", { name: "Compare Runs" })).toBeVisible();
  });
});
