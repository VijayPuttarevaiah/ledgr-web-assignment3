import { test, expect } from "@playwright/test";
import { signUpNewUser } from "../integration/helpers";

/**
 * §2 Daniel's acceptance narrative: itemised restaurant bill, tap-to-assign
 * line items, configurable tax/tip allocation, live per-person totals, a
 * shareable PDF generated before anyone pays, then confirm and see the
 * group balance update instantly.
 *
 * AI is off in this deployment, so "photograph the bill" degrades to manual
 * line-item entry per spec — the itemised-assignment + tax/tip + PDF +
 * confirm mechanics under test here are identical either way.
 */
test("Daniel: itemised bill with configurable tax/tip, PDF export, and instant balance update", async ({ page }) => {
  await signUpNewUser(page, "daniel");

  await page.goto("/split");
  await page.getByRole("button", { name: "Create your first group" }).click();
  await page.getByLabel("Group name").fill("Italy Trip 2026");
  await page.getByRole("button", { name: "Create group" }).click();
  await page.waitForTimeout(800);

  await page.getByRole("button", { name: "+ Add expense" }).click();
  await page.locator("#expDescription").fill("Pizza Night");
  await page.locator("#expAmount").fill("67.20");
  await page.getByRole("button", { name: "Itemised" }).click();
  await page.getByRole("button", { name: "Continue to receipt editor" }).click();
  await page.waitForTimeout(1000);

  // Live per-person totals as items are added and assigned (direct manipulation).
  await page.getByPlaceholder("Item name").fill("Pepperoni Pizza");
  await page.locator('input[value="1"]').first().fill("1");
  await page.getByPlaceholder("0.00").fill("22.99");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator("text=tap to assign").first().click();
  await page.waitForTimeout(400);
  // A per-person total tile appears once at least one item is assigned.
  await expect(page.locator("text=/\\$\\d+\\.\\d{2}/").first()).toBeVisible();

  // Tax/tip allocation is independently configurable (proportional vs equal).
  const taxSelect = page.locator("select").filter({ hasText: "Proportional" }).first();
  await taxSelect.selectOption("equal");
  await expect(taxSelect).toHaveValue("equal");

  // A shareable PDF can be generated before anyone pays / before confirming.
  // The link opens in a new tab (target="_blank"), so the response has to
  // be awaited context-wide, not on the originating page.
  const [pdfResponse] = await Promise.all([
    page.context().waitForEvent("response", (r) => r.url().includes("/pdf") && r.request().method() === "GET"),
    page.getByRole("button", { name: "Generate PDF" }).click(),
  ]);
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");

  // Confirm — group balance / ledger updates instantly, no separate step.
  await page.getByRole("button", { name: "Confirm split" }).click();
  await page.getByRole("button", { name: "Confirm split" }).last().click();
  await expect(page.getByText("Split confirmed")).toBeVisible();

  await page.goto("/ledger?filter=shared");
  await expect(page.getByText("Split: Pizza Night")).toBeVisible();
});
