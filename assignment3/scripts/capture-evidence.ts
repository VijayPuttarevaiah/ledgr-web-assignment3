/**
 * Assignment 3 — screenshots of the generated HTML reports.
 *
 * ZAP and JMeter both produce HTML that is the primary evidence for §7 and
 * §3. Rendering them in a browser and capturing PNGs lets the report show
 * what the tools actually emitted rather than only quoting numbers retyped
 * out of them.
 *
 * Captures are taken at 1470x810 with a 2x device scale, producing 2940x1620
 * images. That matches the Grafana captures exactly, so every screenshot in
 * the report scales to the same width on the page instead of each figure
 * being a slightly different size.
 *
 * Where a page does not fit in one frame, it is captured in successive
 * vertical sections rather than squeezed into a single unreadable image.
 *
 * Usage: npm run capture:evidence
 */
import { chromium, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "report", "figures");

/** Matches the Grafana screenshots: 1470 x 810 logical, 2x scale. */
const VIEW = { width: 1470, height: 810 };
const SCALE = 2;

interface Section {
  /** Suffix appended to the figure name. */
  name: string;
  /** Pixels to scroll from the top of the document before capturing. */
  scrollY: number;
}

interface Target {
  file: string;
  name: string;
  sections: Section[];
}

const TARGETS: Target[] = [
  {
    file: "jmeter/results/baseline/moderate-report/index.html",
    name: "jmeter-baseline",
    sections: [
      { name: "1-apdex-summary", scrollY: 0 },
      { name: "2-statistics", scrollY: 760 },
    ],
  },
  {
    file: "jmeter/results/optimized/moderate-report/index.html",
    name: "jmeter-optimized",
    sections: [
      { name: "1-apdex-summary", scrollY: 0 },
      { name: "2-statistics", scrollY: 760 },
    ],
  },
  {
    file: "zap/before/zap-full-report.html",
    name: "zap-before",
    sections: [
      { name: "1-summary", scrollY: 0 },
      { name: "2-alerts", scrollY: 620 },
    ],
  },
  {
    file: "zap/after/zap-full-report.html",
    name: "zap-after",
    sections: [
      { name: "1-summary", scrollY: 0 },
      { name: "2-alerts", scrollY: 620 },
    ],
  },
];

async function capture(page: Page, target: Target) {
  const path = resolve(ROOT, target.file);
  if (!existsSync(path)) {
    console.log(`  skipped (not generated): ${target.file}`);
    return;
  }

  await page.goto(pathToFileURL(path).href, { waitUntil: "domcontentloaded" });
  // JMeter's dashboard draws its graphs with jQuery Flot after load.
  await page.waitForTimeout(3500);

  for (const section of target.sections) {
    await page.evaluate((y) => window.scrollTo(0, y), section.scrollY);
    await page.waitForTimeout(700);
    const file = `${target.name}-${section.name}.png`;
    await page.screenshot({ path: resolve(OUT_DIR, file) });
    console.log(`  ${file}`);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE });
  const page = await context.newPage();

  for (const target of TARGETS) {
    await capture(page, target);
  }

  await browser.close();
  console.log(`\nWrote screenshots to ${OUT_DIR} at ${VIEW.width * SCALE}x${VIEW.height * SCALE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
