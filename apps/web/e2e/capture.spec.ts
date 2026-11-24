import { expect, test } from "@playwright/test";
import path from "node:path";

const SCREENSHOTS_DIR = path.resolve(__dirname, "../../../docs/screenshots");

test.describe("Capture Project Showcase Screenshots", () => {
  test.use({
    viewport: { width: 1440, height: 920 },
    deviceScaleFactor: 2,
  });

  test("capture all showcase screenshots", async ({ page }) => {
    page.on("pageerror", (err) => {
      console.log("PAGEERROR STACK:", err.stack);
    });
    // 1. Overview
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /Read the river in its flow/ }),
    ).toBeVisible();
    // Wait for overview metrics to populate
    await expect(page.getByText("MONITORING STATIONS")).toBeVisible();
    const stationMetric = page
      .locator(".metric")
      .filter({ hasText: "MONITORING STATIONS" })
      .locator(".metric-value");
    await expect(stationMetric).toHaveText(/^(?:[\d,]+|—)$/);
    await page.waitForTimeout(1000); // Allow MapLibre canvas to paint points
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "overview.png"),
      fullPage: false,
    });

    // 2. Global Atlas Map
    await page.getByRole("button", { name: "Global atlas" }).click();
    await expect(
      page.getByRole("heading", { name: "Global atlas" }),
    ).toBeVisible();
    await page.waitForTimeout(1500); // Allow deck.gl scatterplot layer to load and render
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "atlas-map.png"),
      fullPage: false,
    });

    // 3. Flow Analysis (C-Q Scatter & Flow Regimes)
    await page.getByRole("button", { name: "Flow analysis" }).click();
    await expect(
      page.getByRole("heading", { name: /Chemistry across/ }),
    ).toBeVisible();
    await page.waitForTimeout(1500); // Allow D3 scatter and regime summary to render
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "flow-analysis.png"),
      fullPage: false,
    });

    // 4. Temporal Trends
    await page.getByRole("button", { name: "Temporal trends" }).click();
    await expect(
      page.getByRole("heading", { name: "Temporal trend analysis" }),
    ).toBeVisible();
    await page.waitForTimeout(1500); // Allow Theil-Sen regression and trend series to render
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "temporal-trends.png"),
      fullPage: false,
    });

    // 5. Seasonality
    await page.getByRole("button", { name: "Seasonality" }).click();
    await expect(
      page.getByRole("heading", { name: "Seasonal patterns" }),
    ).toBeVisible();
    await page.waitForTimeout(1500); // Allow monthly boxplot and distribution curves to render
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "seasonality.png"),
      fullPage: false,
    });

    // 6. Data Quality
    await page.getByRole("button", { name: "Data quality" }).click();
    await expect(
      page.getByRole("heading", { name: "Imported record quality" }),
    ).toBeVisible();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "data-quality.png"),
      fullPage: false,
    });
  });
});
