import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./tests",
  testMatch: ["integration/**/*.spec.ts", "e2e/**/*.spec.ts"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Runs against a production build, not `next dev`: Turbopack's dev-mode
  // HMR websocket doesn't survive this environment's browser sandbox (the
  // upgrade succeeds from curl but not from Playwright's Chromium), and
  // Next's dev client force-reloads the page whenever that socket drops —
  // which silently aborts in-flight test actions like a form submit. A
  // production server has no HMR channel to fail, which is also what CI
  // and a real deploy actually run.
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
