import { expect, test } from "@playwright/test";

test("overview and scientific workspaces render", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /Read the river in its flow/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Stations on the river map" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  if (test.info().project.name === "mobile-chromium") {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.getByRole("button", { name: "Constituents" }).click();
  await expect(
    page.getByRole("heading", { name: "Water quality constituents" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Search constituents" }),
  ).toBeVisible();

  if (test.info().project.name === "mobile-chromium") {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.getByRole("button", { name: "Temporal trends" }).click();
  await expect(
    page.getByRole("heading", { name: "Temporal trend analysis" }),
  ).toBeVisible();

  if (test.info().project.name === "mobile-chromium") {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.getByRole("button", { name: "Seasonality" }).click();
  await expect(
    page.getByRole("heading", { name: "Seasonal patterns" }),
  ).toBeVisible();

  if (test.info().project.name === "mobile-chromium") {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.getByRole("button", { name: "Data quality" }).click();
  await expect(
    page.getByRole("heading", { name: "Imported record quality" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
