import { test, expect } from "@playwright/test";
import { signUpNewUser } from "./helpers";

/**
 * §4.5 / §17 — this deployment runs with AI_FEATURES_ENABLED=false (see
 * .env.local / DECISIONS.md). These tests assert the mandatory kill-switch
 * contract holds under that real configuration: every AI route returns the
 * standardized 200 + {enabled:false} envelope (never 404/403), and every
 * AI-specific DOM element is entirely absent from the rendered output.
 */
test.describe("AI kill switch — master OFF (this deployment's actual configuration)", () => {
  test("categorize endpoint returns the standardized disabled envelope with HTTP 200", async ({ page }) => {
    await signUpNewUser(page, "kill-cat");
    const res = await page.request.post("/api/transactions/categorize", {
      data: { description: "Coffee", amount_cents: 500 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: false, reason: expect.any(String) });
  });

  test("receipt OCR endpoint returns the standardized disabled envelope with HTTP 200", async ({ page }) => {
    await signUpNewUser(page, "kill-ocr");
    const res = await page.request.post("/api/receipts/parse", {
      multipart: { file: { name: "receipt.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: false, reason: expect.any(String) });
  });

  test("narrative endpoint returns the standardized disabled envelope with HTTP 200", async ({ page }) => {
    await signUpNewUser(page, "kill-narr");
    const res = await page.request.post("/api/analytics/narrative");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: false, reason: expect.any(String) });
  });

  test("no AI-specific DOM elements exist in New Entry", async ({ page }) => {
    await signUpNewUser(page, "kill-dom-entry");
    await page.getByTitle("New entry").click();
    await expect(page.getByTestId("ai-categorize-badge")).toHaveCount(0);
    await expect(page.getByTestId("receipt-ocr-dropzone")).toHaveCount(0);
    // The core fallback must still be present and usable.
    await expect(page.getByText("Attach receipt (optional)")).toBeVisible();
  });

  test("no AI narrative card exists in Analytics", async ({ page }) => {
    await signUpNewUser(page, "kill-dom-analytics");
    await page.goto("/analytics");
    await expect(page.getByTestId("ai-narrative-card")).toHaveCount(0);
  });

  test("zero outbound requests to any AI provider during the New Entry + Analytics flows", async ({ page }) => {
    const aiRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("api.anthropic.com") || url.includes("vision.googleapis.com")) aiRequests.push(url);
    });

    await signUpNewUser(page, "kill-network");
    await page.getByTitle("New entry").click();
    await page.locator("#amount").fill("12.34");
    await page.locator("#description").fill("Network probe test");
    await page.getByRole("button", { name: "Save transaction" }).click();
    await page.waitForTimeout(500);
    await page.goto("/analytics");
    await page.waitForTimeout(500);

    expect(aiRequests).toEqual([]);
  });
});
