import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /explore live demo/i }).click();
  await expect(page).toHaveURL(/dashboard/);
});

test("navigates the vault by graph, link and search", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/knowledge");
  await expect(page.getByRole("heading", { name: "Agent knowledge wiki" })).toBeVisible();

  // The index is the landing page, and navigating from it is meant to beat searching.
  await expect(page.getByTestId("note-title")).toHaveText("Wiki Index");
  await expect(page.getByTestId("knowledge-graph")).toBeVisible();

  // A wikilink in the preview navigates, the way it would in an editor. The link renders its
  // target verbatim, so the button carries the page id rather than the page title.
  await page
    .getByTestId("note-body")
    .getByRole("button", { name: "domain/envelope-analysis" })
    .first()
    .click();
  await expect(page.getByTestId("note-title")).toHaveText("Envelope Analysis");

  // Backlinks are the other half of the page: what points here.
  await expect(page.getByTestId("note-links")).toContainText(/pages point here/);
  await page.getByTestId("note-links").getByRole("button", { name: "Bearing Degradation Stages" }).first().click();
  await expect(page.getByTestId("note-title")).toHaveText("Bearing Degradation Stages");

  // Search finds a page whose title gives nothing away, and says why it matched.
  await page.getByLabel("Search the wiki").fill("majority class baseline");
  const hit = page.getByRole("button", { name: "Class Imbalance in Failure Data" }).first();
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page.getByTestId("note-title")).toHaveText("Class Imbalance in Failure Data");

  expect(errors).toEqual([]);
});

test("edits a page and the graph follows in the same frame", async ({ page }) => {
  await page.goto("/knowledge");
  await page.getByLabel("Search the wiki").fill("data drift");
  await page.getByRole("button", { name: "Data Drift" }).first().click();
  await expect(page.getByTestId("note-title")).toHaveText("Data Drift");

  // The new link is to a page nobody has written, so it should become a wanted page rather than
  // a dropped edge.
  await page.getByRole("button", { name: /^Edit$/ }).click();
  const source = page.getByLabel("Page source");
  await source.fill((await source.inputValue()) + "\n\nSee also [[concepts/alarm-volume-budgeting]].\n");
  await page.getByLabel("Reason for this change").fill("noted the alarm-volume question");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Saved").first()).toBeVisible();
  await expect(page.getByTestId("note-links")).toContainText("Alarm Volume Budgeting");

  // Lint reports it twice, and both are the point: the link now goes nowhere, and the page it
  // wants is on the worklist. Neither is an error.
  await page.getByRole("button", { name: /Lint|Wiki is healthy/ }).click();
  await expect(
    page.getByRole("button", { name: "Data Drift → concepts/alarm-volume-budgeting via link" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "concepts/alarm-volume-budgeting not written yet" }),
  ).toBeVisible();
});

test("refuses to edit the immutable original", async ({ page }) => {
  await page.goto("/knowledge");
  await page.getByRole("button", { name: /^Sources$/ }).click();
  await page.getByRole("button", { name: /Legacy Maintenance Guidelines/ }).first().click();

  await expect(page.getByTestId("note-title")).toHaveText("Legacy Maintenance Guidelines (original)");
  await expect(page.getByText(/raw\/ is immutable/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit/ })).toBeDisabled();
});

test("the preview scrolls a page taller than its pane", async ({ page }) => {
  await page.goto("/knowledge");
  await expect(page.getByTestId("note-title")).toHaveText("Wiki Index");

  // A long page, so the body is guaranteed to overflow its pane.
  await page.getByLabel("Search the wiki").fill("bearing degradation stages");
  await page.getByRole("button", { name: "Bearing Degradation Stages" }).first().click();
  await expect(page.getByTestId("note-title")).toHaveText("Bearing Degradation Stages");

  // The pane used to size itself to its content and get clipped by the card, which left the
  // reader with no way to reach the bottom of a page.
  const body = page.getByTestId("note-body");
  const overflows = await body.evaluate((node) => node.scrollHeight > node.clientHeight + 8);
  expect(overflows).toBe(true);

  await body.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
  const scrolled = await body.evaluate((node) => node.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
});
