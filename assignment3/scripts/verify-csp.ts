import { chromium } from "@playwright/test";
const BASE = "http://localhost:3100";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const violations: string[] = [];
  const errors: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) violations.push(t);
    else if (m.type() === "error") errors.push(t);
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("demo@ledgr.app");
  await page.locator('input[type="password"]').fill("DemoPass123!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  console.log("sign-in OK (client-side JS ran, so hydration works)");

  for (const path of ["/dashboard", "/ledger", "/analytics", "/split", "/settings"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    console.log(`  ${path} -> ${await page.title()}`);
  }

  // Interactivity check: the nav "New entry" button opens a lazily-loaded modal.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const btn = page.getByRole("button", { name: /new entry/i }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(1200);
    console.log("  New-entry modal opened:", await page.locator("text=/amount|description/i").first().isVisible());
  }

  // Nonce must actually be on the script tags, or the app only works by luck.
  const nonced = await page.evaluate(() => {
    const s = Array.from(document.querySelectorAll("script"));
    return { total: s.length, withNonce: s.filter((x) => x.getAttribute("nonce")).length };
  });
  console.log("  script tags:", nonced.total, "with nonce:", nonced.withNonce);

  console.log("\nCSP violations:", violations.length);
  violations.slice(0, 8).forEach((v) => console.log("   !", v.slice(0, 160)));
  console.log("Other console errors:", errors.length);
  errors.slice(0, 5).forEach((v) => console.log("   -", v.slice(0, 160)));
  await browser.close();
  process.exit(violations.length ? 1 : 0);
})();
