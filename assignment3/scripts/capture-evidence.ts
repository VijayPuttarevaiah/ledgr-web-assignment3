/**
 * Assignment 3 — screenshots of the generated HTML reports, for the report.
 *
 * ZAP and JMeter both produce HTML that is the primary evidence for §4 and
 * §3 respectively. Rendering them in a browser and capturing PNGs means the
 * report can show what the tools actually output rather than only quoting
 * numbers retyped out of them.
 *
 * Usage: npm run capture:evidence
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "report", "figures");

interface Target {
  file: string;
  name: string;
  /** Crop to the top of the page instead of capturing the whole thing. */
  clipHeight?: number;
}

const TARGETS: Target[] = [
  { file: "zap/before/zap-full-report.html", name: "zap-report-before" },
  { file: "zap/after/zap-full-report.html", name: "zap-report-after" },
  { file: "jmeter/results/baseline/moderate-report/index.html", name: "jmeter-dashboard-baseline-moderate", clipHeight: 1500 },
  { file: "jmeter/results/optimized/moderate-report/index.html", name: "jmeter-dashboard-optimized-moderate", clipHeight: 1500 },
  { file: "jmeter/results/baseline/light-report/index.html", name: "jmeter-dashboard-baseline-light", clipHeight: 1500 },
  { file: "jmeter/results/optimized/light-report/index.html", name: "jmeter-dashboard-optimized-light", clipHeight: 1500 },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1400 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  for (const target of TARGETS) {
    const path = resolve(ROOT, target.file);
    if (!existsSync(path)) {
      console.log(`  skipped (not generated): ${target.file}`);
      continue;
    }
    await page.goto(pathToFileURL(path).href, { waitUntil: "domcontentloaded" });
    // JMeter's dashboard draws its graphs with jQuery Flot after load.
    await page.waitForTimeout(3500);
    await page.screenshot({
      path: resolve(OUT_DIR, `${target.name}.png`),
      fullPage: target.clipHeight === undefined,
      ...(target.clipHeight ? { clip: { x: 0, y: 0, width: 1500, height: target.clipHeight } } : {}),
    });
    console.log(`  ${target.name}.png`);
  }

  await browser.close();
  console.log(`\nWrote screenshots to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
