import { expect, test } from "@playwright/test";

async function enterDemo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByText(/all displayed live metrics are simulated/i)).toBeVisible();
  await page.getByRole("button", { name: /explore live demo/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("streams a scripted turn with the single supervisor's tool trace", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/chat");
  await page.getByRole("textbox").last().fill("Plot session 78 telemetry");
  await page.getByRole("button", { name: /^Send/ }).click();
  await expect(page.getByText("Packaging Drive 01 vibration telemetry")).toBeVisible();
  await page.getByRole("button", { name: /Sources & Actions Used/ }).first().click();
  await expect(page.getByText("Read sensor data").first()).toBeVisible();
  await expect(page.getByText("SQL sub-agent")).toHaveCount(0);
});

test("checks Process Pump 02 with its registered model and forecasts it", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/simulator?entityId=machine-b-02");
  await page.getByRole("button", { name: "Check failure risk" }).click();
  await expect(page.getByText("Most likely result")).toBeVisible();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText(/rows · scroll inside the table/)).toBeVisible();
});

test("keeps the legacy session simulator for the drives, with demo provenance", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/simulator?entityId=machine-c-01&sessionId=78&horizon=1-hour");
  await page.getByRole("button", { name: /Use legacy Machine C simulator/ }).click();
  await expect(page.getByText("Observed client-derived fixture")).toBeVisible();
});

test("watches a replayed CMTK feed live, in 3D, with health checks and the next hour", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enterDemo(page);
  await page.goto("/monitor/machine-c-01");
  await expect(page.getByText("Packaging Drive 01").first()).toBeVisible();
  await expect(page.getByText("Vibration in 3D")).toBeVisible();
  await expect(page.getByText("Predicted vibration level").first()).toBeVisible();
  await expect(page.getByText("Next hour", { exact: true })).toBeVisible();
  const first = await page.getByText(/^Last reading:/).first().innerText();
  await expect.poll(async () => page.getByText(/^Last reading:/).first().innerText(), { timeout: 8_000 }).not.toBe(first);
  expect(errors).toEqual([]);
});

test("keeps core demo pages usable at desktop and mobile widths", async ({ page }) => {
  await enterDemo(page);
  const pages = ["/dashboard", "/machines", "/history", "/chat", "/simulator", "/monitor/machine-c-02", "/knowledge", "/mlops"] as const;
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const url of pages) {
      await page.goto(url);
      await expect(page.getByLabel("Portfolio demo data notice")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), url).toBe(true);
    }
  }
});
