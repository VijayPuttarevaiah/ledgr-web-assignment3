import { test, expect } from "@playwright/test";
import { signUpNewUser } from "./helpers";

/** §12 — integration tests for the API surface, including auth-rejection and cross-user isolation. */
test.describe("API auth boundaries", () => {
  test("a request without a valid session is rejected, not silently allowed", async ({ request }) => {
    const res = await request.get("/api/transactions");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthenticated");
  });

  test("unauthenticated requests to every core mutation route are rejected", async ({ request }) => {
    const routes: [string, string][] = [
      ["POST", "/api/transactions"],
      ["POST", "/api/groups"],
      ["POST", "/api/budgets"],
      ["PATCH", "/api/profile"],
    ];
    for (const [method, url] of routes) {
      const res = await request.fetch(url, { method, data: {} });
      expect(res.status(), `${method} ${url} should require auth`).toBe(401);
    }
  });

  test("a signed-in user can create and read their own transaction via the API", async ({ page }) => {
    await signUpNewUser(page, "api-owner");
    const create = await page.request.post("/api/transactions", {
      data: {
        type: "expense",
        amount_cents: 1234,
        description: "API test purchase",
        occurred_on: new Date().toISOString().slice(0, 10),
      },
    });
    expect(create.ok()).toBeTruthy();
    const { transaction } = await create.json();
    expect(transaction.amount_cents).toBe(1234);

    const list = await page.request.get("/api/transactions");
    const { transactions } = await list.json();
    expect(transactions.some((t: { id: string }) => t.id === transaction.id)).toBe(true);
  });

  test("a second user cannot read or modify the first user's transaction (RLS enforced, not just hidden by the UI)", async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signUpNewUser(ownerPage, "rls-owner");
    const create = await ownerPage.request.post("/api/transactions", {
      data: {
        type: "expense",
        amount_cents: 5000,
        description: "Owner-only transaction",
        occurred_on: new Date().toISOString().slice(0, 10),
      },
    });
    const { transaction } = await create.json();

    const attackerContext = await browser.newContext();
    const attackerPage = await attackerContext.newPage();
    await signUpNewUser(attackerPage, "rls-attacker");

    // Attacker's own list must not include the owner's transaction.
    const attackerList = await attackerPage.request.get("/api/transactions");
    const { transactions: attackerTx } = await attackerList.json();
    expect(attackerTx.some((t: { id: string }) => t.id === transaction.id)).toBe(false);

    // A direct PATCH by id must be rejected (404, since RLS makes the row invisible to them — not a 200 that leaks data).
    const attackerPatch = await attackerPage.request.patch(`/api/transactions/${transaction.id}`, {
      data: { description: "hijacked" },
    });
    expect(attackerPatch.status()).toBe(404);

    const attackerDelete = await attackerPage.request.delete(`/api/transactions/${transaction.id}`);
    expect(attackerDelete.status()).toBe(404);

    // Confirm the owner's row is untouched.
    const ownerList = await ownerPage.request.get("/api/transactions");
    const { transactions: ownerTx } = await ownerList.json();
    const stillThere = ownerTx.find((t: { id: string }) => t.id === transaction.id);
    expect(stillThere.description).toBe("Owner-only transaction");

    await ownerContext.close();
    await attackerContext.close();
  });
});
