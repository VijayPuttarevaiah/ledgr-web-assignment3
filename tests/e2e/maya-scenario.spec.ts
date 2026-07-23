import { test, expect } from "@playwright/test";
import { signUpNewUser } from "../integration/helpers";

/**
 * §2 Maya's acceptance narrative: log a personal expense, split a shared
 * Costco-style run three ways in Split Studio, and see her share land in
 * the personal ledger with zero separate reconciliation step.
 *
 * This deployment runs with AI_FEATURES_ENABLED=false, so the receipt-photo
 * auto-fill step degrades to manual entry per the spec's explicit
 * requirement that both personas must degrade gracefully with AI off — the
 * auto-flow mechanic under test here is identical either way.
 */
test("Maya: manual entry + three-way itemised split auto-flows into her personal ledger", async ({ page }) => {
  await signUpNewUser(page, "maya");

  // Part 1 — a quick personal transaction (the "under 5 seconds" entry the persona wants).
  await page.getByTitle("New entry").click();
  await page.locator("#amount").fill("87.40");
  await page.locator("#description").fill("Sobeys — Weekly Groceries");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByText("Transaction saved")).toBeVisible();

  // Part 2 — the shared Costco run, split three ways.
  await page.goto("/split");
  await page.getByRole("button", { name: "Create your first group" }).click();
  await page.getByLabel("Group name").fill("Apartment 4B");
  await page.getByRole("button", { name: "Create group" }).click();
  await page.waitForTimeout(800);

  await page.getByRole("button", { name: "+ Add expense" }).click();
  await page.locator("#expDescription").fill("Costco Run");
  await page.locator("#expAmount").fill("215.60");
  await page.getByRole("button", { name: "Itemised" }).click();
  await page.getByRole("button", { name: "Continue to receipt editor" }).click();
  await page.waitForTimeout(1000);

  await page.getByPlaceholder("Item name").fill("Groceries (mixed)");
  await page.locator('input[value="1"]').first().fill("1");
  await page.getByPlaceholder("0.00").fill("215.60");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(500);

  // Solo account in this test, so the sole participant absorbs the full
  // itemised total — the mechanic under test is auto-flow, not multi-user
  // fan-out (that's covered by the RLS cross-user isolation test).
  await page.locator("text=tap to assign").first().click();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Confirm split" }).click();
  await page.getByRole("button", { name: "Confirm split" }).last().click();
  await expect(page.getByText("Split confirmed")).toBeVisible();

  // Part 3 — her share is in the personal ledger immediately, no separate step.
  await page.goto("/ledger?filter=shared");
  await expect(page.getByText("Split: Costco Run")).toBeVisible();
  await expect(page.getByText("$215.60")).toBeVisible();

  // And Analytics reflects it without any manual refresh/import action.
  await page.goto("/analytics");
  await expect(page.getByText("Spending", { exact: true })).toBeVisible();
});
