import { expect, test } from "@playwright/test";

test("visitor enters the demo and receives a traced chat response", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/all displayed live metrics are simulated/i)).toBeVisible();

  await page.getByRole("button", { name: /explore live demo/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(/portfolio demo:/i).first()).toBeVisible();

  await page.goto("/chat");
  await page.getByLabel("Prompt").fill("Summarize the fleet risk");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/10 fictional assets/i)).toBeVisible();
  await page.getByRole("button", { name: /agent trace.*2 steps/i }).click();
  await expect(page.getByText("Demo tool call")).toBeVisible();
});
