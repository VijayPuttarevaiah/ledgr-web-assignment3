/**
 * Assignment 3 §5 — captures the Grafana dashboard and its individual panels
 * as PNGs for the report.
 *
 * Grafana renders panels client-side, so a screenshot has to come from a
 * real browser; the image-renderer plugin that would let the HTTP API return
 * PNGs is not installed. Anonymous viewer access is enabled in
 * docker-compose.yml precisely so this needs no credential handling.
 *
 * Usage: npm run capture:grafana -- --from now-3h
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
const FROM = arg("from", "now-3h");
const TO = arg("to", "now");
const OUT_DIR = resolve(__dirname, "..", "monitoring", "screenshots");

/**
 * The exact epoch-millisecond bounds of the two JMeter runs, read off the
 * .jtl files, padded by a minute either side so the ramp-up and the return
 * to idle are both visible.
 */
const LOAD_TEST_WINDOWS = [
  { name: "dashboard-during-baseline-load-test", from: "1785103414000", to: "1785103834000" },
  { name: "dashboard-during-optimized-load-test", from: "1785105827000", to: "1785106247000" },
];

/** Panel ids come from grafana/dashboards/ledgr-overview.json. */
const PANELS: Array<{ id: number; name: string }> = [
  { id: 10, name: "panel-request-latency-percentiles" },
  { id: 11, name: "panel-p95-latency-by-route" },
  { id: 20, name: "panel-request-rate-by-route" },
  { id: 21, name: "panel-error-rate-and-status-classes" },
  { id: 30, name: "panel-cpu-utilisation" },
  { id: 31, name: "panel-memory-usage" },
  { id: 32, name: "panel-requests-in-flight" },
  { id: 33, name: "panel-event-loop-lag" },
  { id: 34, name: "panel-host-memory" },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  // Grafana only renders panels that are inside the viewport, and a
  // `fullPage: true` screenshot does not change that — it stitches the page
  // together from a viewport-sized window, so everything below the fold
  // comes out as empty panel chrome. A viewport tall enough to hold the
  // whole dashboard is the fix.
  const context = await browser.newContext({
    // A narrower viewport at higher scale makes Grafana lay panels out larger
    // relative to the frame, so axis labels and legends survive being shrunk
    // to fit a page. Capturing wide-and-dense produces a technically correct
    // screenshot that nobody can read once it is embedded.
    viewport: { width: 1280, height: 2900 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();

  const range = `from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`;

  console.log(`Capturing dashboard over ${FROM} .. ${TO}`);
  await page.goto(`${GRAFANA}${DASHBOARD}?${range}&kiosk`, { waitUntil: "domcontentloaded" });
  // Grafana paints panel chrome before the query resolves, so waiting on
  // networkidle alone captures a grid of empty panels.
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);

  await page.screenshot({ path: resolve(OUT_DIR, "dashboard-full.png") });
  console.log("  dashboard-full.png");

  // The two JMeter windows, captured separately. Side by side these are the
  // clearest single piece of evidence in the report: the same dashboard, the
  // same panels, one window with a ~50% error rate and one without.
  for (const window of LOAD_TEST_WINDOWS) {
    await page.goto(
      `${GRAFANA}${DASHBOARD}?from=${window.from}&to=${window.to}&kiosk&refresh=`,
      { waitUntil: "domcontentloaded" }
    );
    await page.waitForTimeout(7000);
    await page.screenshot({ path: resolve(OUT_DIR, `${window.name}.png`) });
    console.log(`  ${window.name}.png`);
  }

  for (const panel of PANELS) {
    await page.goto(`${GRAFANA}${DASHBOARD}?${range}&viewPanel=${panel.id}&kiosk`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: resolve(OUT_DIR, `${panel.name}.png`) });
    console.log(`  ${panel.name}.png`);
  }

  // Prometheus's own target page, as evidence the scrape configuration is
  // live rather than merely present in a file.
  await page.goto("http://localhost:9090/targets", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(OUT_DIR, "prometheus-targets.png"), fullPage: true });
  console.log("  prometheus-targets.png");

  await page.goto("http://localhost:9090/alerts", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(OUT_DIR, "prometheus-alerts.png"), fullPage: true });
  console.log("  prometheus-alerts.png");

  await browser.close();
  console.log(`\nWrote ${PANELS.length + 3} screenshots to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
