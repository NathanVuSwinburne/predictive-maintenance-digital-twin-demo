import { expect, test } from "@playwright/test";

async function enterDemo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByText(/all displayed live metrics are simulated/i)).toBeVisible();
  await page.getByRole("button", { name: /explore live demo/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("plots session telemetry with a visible tool trace", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/chat");
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("button", { name: "Plot session 78 telemetry" }).click();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Packaging Drive 01 vibration telemetry")).toBeVisible();
  await page.getByRole("button", { name: /agent trace.*actions/i }).click();
  await expect(page.getByText("Supervisor", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("SQL sub-agent", { exact: true }).first()).toBeVisible();
});

test("predicts Process Pump 02 with machine-specific fields", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/simulator?mode=predict");
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Process Pump 02" }).click();
  await expect(page.getByText("Process Pump 02 manual prediction")).toBeVisible();
  await expect(page.locator('input[type="number"]')).toHaveCount(5);
  await page.getByRole("button", { name: "Run prediction" }).click();
  await expect(page.getByText("Prediction Result")).toBeVisible();
  await expect(page.getByText(/deterministic demo engineering score/i).last()).toBeVisible();
});

test("simulates session 78 with observed and synthetic provenance", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/simulator?mode=simulate&machineId=machine-c-01&sessionId=78&horizon=1-hour");
  await expect(page.getByText("Session 78", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Observed client-derived fixture")).toBeVisible();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText(/Observed\/client-derived fixture/).first()).toBeVisible();
  await expect(page.getByText(/Synthetic forecast/).first()).toBeVisible();
});

test("keeps core demo pages usable at desktop and mobile widths", async ({ page }) => {
  await enterDemo(page);
  const pages = ["/machines", "/history", "/chat", "/simulator?mode=predict", "/simulator?mode=simulate&machineId=machine-c-01&sessionId=78"] as const;
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const url of pages) {
      await page.goto(url);
      await expect(page.getByLabel("Portfolio demo data notice")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    }
  }
});
