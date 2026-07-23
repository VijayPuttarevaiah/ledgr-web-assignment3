import type { Page } from "@playwright/test";

/** Signs up a fresh test user through the real UI so the browser context holds a real Supabase session cookie. */
export async function signUpNewUser(page: Page, namePrefix: string): Promise<{ email: string; fullName: string }> {
  const email = `${namePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const fullName = `${namePrefix} Test`;
  await page.goto("/sign-up");
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correcthorse123battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  return { email, fullName };
}
