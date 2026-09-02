import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /explore live demo/i }).click();
  await expect(page).toHaveURL(/dashboard/);
});

test("walks a machine from raw columns to an approved model", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/mlops");
  await expect(page.getByRole("heading", { name: "Machine Registry" })).toBeVisible();

  // Step 1, the registry, shaped like the production one: a list and a register form.
  await expect(page.getByRole("button", { name: /Register machine/i })).toBeDisabled();
  // Choosing a machine opens its data, exactly as production does it: one act, not two.
  await page.getByRole("button", { name: /Add data for AI4I Milling Machine/i }).click();
  await expect(page).toHaveURL(/stage=data/);
  await expect(page.getByRole("heading", { name: /Add Data for AI4I Milling Machine/i })).toBeVisible();

  // Step 2: the column contract.
  await expect(page.getByText("Machine failure").first()).toBeVisible();
  await page.getByRole("button", { name: /^Prepare training data$/i }).click();

  // Step 3: the recipe, previewed against the bundled rows.
  await expect(page.getByText(/Fitted Train-only statistics/i)).toBeVisible();
  await page.getByRole("button", { name: /Freeze this recipe into a dataset/i }).click();

  // Step 4: hyperparameters are JSON here, as they are in production.
  await expect(page.getByText("Fit a model")).toBeVisible();
  await expect(page.getByLabel("Configuration JSON")).toBeVisible();
  await page.getByRole("button", { name: /^Apply JSON$/ }).click();
  // A model really is fitted here, so the wait is for arithmetic, not a timer.
  await page.getByRole("button", { name: /Train detect possible failure/i }).click();
  await expect(page.getByText("succeeded")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Always guessing/i).first()).toBeVisible();

  // Approval is an admin duty on its own page, exactly as it is in the production app.
  await page.getByRole("link", { name: /Review for promotion/i }).click();
  await expect(page).toHaveURL(/admin\/models/);
  await expect(page.getByRole("heading", { name: "Machine model approvals" })).toBeVisible();
  await page.getByRole("button", { name: /Approve/i }).first().click();
  await expect(page.getByText(/@production/).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("refuses an architecture it cannot honestly train", async ({ page }) => {
  await page.goto("/mlops");
  await page.getByRole("button", { name: /Add data for AI4I Milling Machine/i }).click();
  await page.getByRole("button", { name: /^Prepare training data$/i }).click();
  await page.getByRole("button", { name: /Freeze this recipe into a dataset/i }).click();

  await expect(page.getByText("Fit a model")).toBeVisible();
  await page.getByRole("combobox", { name: "Model" }).selectOption("xgboost");
  await expect(page.getByText(/will fail with the reason/i)).toBeVisible();

  await page.getByRole("button", { name: /Train detect possible failure/i }).click();
  await expect(page.getByText(/trains on the production worker/i)).toBeVisible({ timeout: 30_000 });
});
