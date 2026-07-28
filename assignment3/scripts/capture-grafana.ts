/**
 * Assignment 3 §5 — captures the Grafana dashboard and its individual panels
 * as PNGs for the report.
 *
 * Grafana renders panels client-side, so a screenshot has to come from a
 * real browser; the image-renderer plugin that would let the HTTP API return
 * PNGs is not installed. Anonymous viewer access is enabled in
 * docker-compose.yml precisely so this needs no credential handling.
 *
 * Usage: npm run capture:grafana
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}

const GRAFANA = arg("grafana", "http://localhost:3001");
const DASHBOARD = "/d/ledgr-overview/ledgr-application-health-assignment-3";
const OUT_DIR = resolve(__dirname, "..", "monitoring", "screenshots");

/**
 * The exact epoch-millisecond bounds of the two JMeter runs, read off the
 * .jtl files, padded by a minute either side so the ramp-up and the return
 * to idle are both visible.
 */
const LOAD_TEST_WINDOWS = [
  { prefix: "grafana-baseline", from: "1785103414000", to: "1785103834000" },
  { prefix: "grafana-optimized", from: "1785105827000", to: "1785106247000" },
];

/**
 * A full-height capture of the dashboard is legible on a monitor and
 * cramped once scaled onto a page - the mean/max column beside each legend
 * is the first thing to go. Each window is therefore captured in three
 * vertical sections, which is what the report embeds.
 */
const SECTIONS = [
  { name: "1-indicators-latency", scrollY: 0 },
  { name: "2-throughput-resources", scrollY: 700 },
  { name: "3-concurrency", scrollY: 1150 },
];

/** Panel ids come from grafana/dashboards/ledgr-overview.json. */


async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  // Grafana only renders panels that are inside the viewport, and a
  // `fullPage: true` screenshot does not change that — it stitches the page
  // together from a viewport-sized window, so everything below the fold
  // comes out as empty panel chrome. A viewport tall enough to hold the
  // whole dashboard is the fix.
  // Matches the JMeter and ZAP captures exactly, so every figure in the
  // report scales to the same width on the page.
  const context = await browser.newContext({
    viewport: { width: 1470, height: 810 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  for (const run of LOAD_TEST_WINDOWS) {
    await page.goto(
      `${GRAFANA}${DASHBOARD}?from=${run.from}&to=${run.to}&kiosk&refresh=`,
      { waitUntil: "domcontentloaded" }
    );
    // Grafana paints panel chrome before its queries resolve; without this
    // the capture is a grid of empty panels.
    await page.waitForTimeout(7000);

    for (const section of SECTIONS) {
      await page.evaluate((y) => window.scrollTo(0, y), section.scrollY);
      await page.waitForTimeout(1200);
      const file = `${run.prefix}-${section.name}.png`;
      await page.screenshot({ path: resolve(OUT_DIR, file) });
      console.log(`  ${file}`);
    }
  }

  await page.goto("http://localhost:9090/targets", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(OUT_DIR, "prometheus-targets.png"), fullPage: true });
  console.log("  prometheus-targets.png");

  await page.goto("http://localhost:9090/alerts", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(OUT_DIR, "prometheus-alerts.png"), fullPage: true });
  console.log("  prometheus-alerts.png");

  await browser.close();
  console.log(`\nWrote ${LOAD_TEST_WINDOWS.length * SECTIONS.length + 2} screenshots to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
