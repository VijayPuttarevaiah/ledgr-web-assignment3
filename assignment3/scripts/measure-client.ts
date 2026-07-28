/**
 * Assignment 3 §2 — client-side rendering measurements.
 *
 * JMeter measures the server: how fast bytes leave the box. It cannot say
 * anything about how long the browser then spends parsing and executing
 * those bytes, which is exactly what the client-side optimisations target.
 * This script fills that gap with a real headless Chromium session and
 * reports, per route:
 *
 *   - JavaScript transferred (bytes and file count) on a cold HTTP cache
 *   - First Contentful Paint and Largest Contentful Paint
 *   - DOMContentLoaded and load
 *   - total long-task time after navigation (the Total Blocking Time proxy)
 *   - RSC payload requests made while navigating between routes, which is
 *     what the client-side router cache changes
 *
 * Every route is measured in a *fresh browser context* with an empty cache.
 * Measuring several routes in one context is the classic trap here: shared
 * chunks are already cached by the time the second route loads, so the
 * second route looks free and the numbers are meaningless.
 *
 * Usage:
 *   npm run measure:client -- --label baseline
 *   npm run measure:client -- --label optimized
 */
import { chromium, type Browser, type Page } from "@playwright/test";

/** Playwright's storageState payload — what `context.storageState()` returns and `newContext()` accepts. */
type StorageState = Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>;
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}

const BASE_URL = arg("base-url", "http://localhost:3100");
const EMAIL = arg("email", "demo@ledgr.app");
const PASSWORD = arg("password", "DemoPass123!");
const LABEL = arg("label", "baseline");
const RUNS = Number(arg("runs", "5"));
/**
 * Simulate a real network and a mid-range device.
 *
 * Over loopback on an M4 the pages already paint in under 100 ms, so bundle
 * size is not the binding constraint and a before/after on FCP measures
 * nothing but noise. That is a property of the measuring environment, not
 * of the application: on any real connection the JavaScript has to arrive
 * before it can run. Throttling to a 4G-class link and a 4x CPU slowdown
 * puts the measurement back in the regime where payload size governs paint,
 * which is the regime actual users are in.
 *
 * Figures follow Chrome DevTools' "Fast 4G" preset.
 */
const THROTTLE = args.includes("--throttle");
const NETWORK = { downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8, latency: 85 };
const CPU_SLOWDOWN = 4;
const OUT_DIR = resolve(__dirname, "..", "report", "data");

const ROUTES = ["/dashboard", "/ledger", "/analytics"];

interface RouteSample {
  /** JS fetched before the load event — what actually delays first paint. */
  initialJsBytes: number;
  initialJsRequests: number;
  /** Everything eventually fetched, lazy chunks included. */
  jsBytes: number;
  jsRequests: number;
  totalBytes: number;
  fcpMs: number;
  lcpMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  longTaskMs: number;
}

/** Signs in once and returns the storage state, so each measured context starts authenticated but cache-cold. */
async function captureStorageState(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  const state = await context.storageState();
  await context.close();
  return state;
}

type PaintMetrics = Pick<RouteSample, "fcpMs" | "lcpMs" | "domContentLoadedMs" | "loadMs" | "longTaskMs">;

async function collectPaintMetrics(page: Page): Promise<PaintMetrics> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const perf = (window as unknown as { __perf?: { lcp: number; longTaskMs: number } }).__perf;
    return {
      fcpMs: fcp ? Math.round(fcp.startTime) : 0,
      lcpMs: perf ? Math.round(perf.lcp) : 0,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      loadMs: nav ? Math.round(nav.loadEventEnd) : 0,
      longTaskMs: perf ? Math.round(perf.longTaskMs) : 0,
    };
  });
}

async function measureRoute(browser: Browser, storageState: StorageState, route: string): Promise<RouteSample> {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  if (THROTTLE) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETWORK });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  }

  // LCP and longtask entries are not retained in the performance timeline
  // the way paint entries are - `getEntriesByType` returns an empty list for
  // them however early it is called. They are only delivered to a live
  // PerformanceObserver, so the observer has to be installed before first
  // paint and has to keep the entries itself.
  await page.addInitScript(() => {
    const store = { lcp: 0, longTaskMs: 0 };
    (window as unknown as { __perf: typeof store }).__perf = store;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) store.lcp = Math.max(store.lcp, entry.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) store.longTaskMs += entry.duration;
      }).observe({ type: "longtask", buffered: true });
    } catch {
      /* metrics simply come back as 0 on browsers without these entry types */
    }
  });

  let jsBytes = 0;
  let jsRequests = 0;
  let totalBytes = 0;
  // Code splitting does not reduce the *total* bytes a page eventually
  // fetches — a lazily-imported component still downloads once it renders.
  // What it changes is how much JavaScript stands between the request and
  // first paint, so the bytes are snapshotted at the load event as well.
  let loaded = false;
  let initialJsBytes = 0;
  let initialJsRequests = 0;
  page.on("load", () => {
    loaded = true;
    initialJsBytes = jsBytes;
    initialJsRequests = jsRequests;
  });
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(BASE_URL).origin) return;
    try {
      const body = await response.body();
      totalBytes += body.length;
      if (url.pathname.endsWith(".js")) {
        jsBytes += body.length;
        jsRequests += 1;
        if (!loaded) {
          initialJsBytes = jsBytes;
          initialJsRequests = jsRequests;
        }
      }
    } catch {
      /* redirects and aborted requests have no retrievable body */
    }
  });

  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  // Give LCP and any post-hydration long tasks a moment to settle. Under
  // throttling everything lands later, so the window has to be wider.
  await page.waitForTimeout(THROTTLE ? 3000 : 1200);
  const paint = await collectPaintMetrics(page);

  await context.close();
  return { initialJsBytes, initialJsRequests, jsBytes, jsRequests, totalBytes, ...paint };
}

/**
 * Counts the requests a *client-side* navigation makes. Next.js fetches an
 * RSC payload per navigation unless the router cache still holds one, so
 * this is the number the client-side caching change moves.
 */
async function measureNavigationRequests(browser: Browser, storageState: StorageState) {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  // These two must be counted apart. A prefetch is speculative and happens
  // while the user is doing nothing; a blocking fetch is what the user waits
  // on after clicking. Lumping them together makes a *better* configuration
  // look worse, because enabling the router cache is exactly what makes
  // Next.js prefetch more eagerly.
  let blockingRsc = 0;
  let prefetchRsc = 0;
  page.on("request", (request) => {
    const headers = request.headers();
    if (headers["next-router-prefetch"] === "1") prefetchRsc += 1;
    else if (headers["rsc"] === "1") blockingRsc += 1;
  });

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  const startBlocking = blockingRsc;
  const startPrefetch = prefetchRsc;

  // Walk Dashboard -> Ledger -> Analytics -> Dashboard -> Ledger twice. The
  // second lap is the interesting one: those destinations have all been
  // visited, so a warm router cache should serve them without new fetches.
  const started = Date.now();
  for (let lap = 0; lap < 2; lap += 1) {
    for (const label of ["Ledger", "Analytics", "Dashboard"]) {
      await page.getByRole("link", { name: label, exact: true }).first().click();
      await page.waitForLoadState("networkidle");
    }
  }
  const elapsedMs = Date.now() - started;

  await context.close();
  return {
    navigationBlockingRsc: blockingRsc - startBlocking,
    navigationPrefetchRsc: prefetchRsc - startPrefetch,
    navigationElapsedMs: elapsedMs,
  };
}


/**
 * Total JavaScript downloaded by one user in one browsing session across all
 * three routes, in a single context with a warm HTTP cache.
 *
 * This is the number the shared-chart-chunk change moves, and the per-route
 * cold-cache figures cannot show it: measured in isolation each route looks
 * much the same either way, because each still downloads one copy of the
 * charting library. The duplication only becomes visible when the same user
 * visits Dashboard *and* Analytics, which is the ordinary path through the
 * app. Bytes are counted per unique URL so a cache hit is not counted twice.
 */
async function measureSession(browser: Browser, storageState: StorageState) {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  if (THROTTLE) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETWORK });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  }

  await page.addInitScript(() => {
    const store = { lcp: 0 };
    (window as unknown as { __perf: typeof store }).__perf = store;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) store.lcp = Math.max(store.lcp, entry.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch { /* metric simply comes back as 0 */ }
  });

  const seen = new Map<string, number>();
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(BASE_URL).origin) return;
    if (!url.pathname.endsWith(".js")) return;
    if (seen.has(url.pathname)) return;
    try {
      seen.set(url.pathname, (await response.body()).length);
    } catch {
      /* aborted request — nothing to weigh */
    }
  });

  // Per-hop figures, not just the session total. The shared-chunk change is
  // invisible on a cold first page - the bundles are near-identical - and
  // only pays off on the *second* page, where a user who already has the
  // chart library should not download it again. That is the hop to measure.
  const hops: Array<{ route: string; newJsKB: number; newJsFiles: number; lcpMs: number }> = [];

  for (const route of ROUTES) {
    const before = new Set(seen.keys());
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(THROTTLE ? 2500 : 400);

    let newBytes = 0;
    let newFiles = 0;
    for (const [path, size] of seen) {
      if (!before.has(path)) {
        newBytes += size;
        newFiles += 1;
      }
    }
    const lcp = await page.evaluate(() => {
      const perf = (window as unknown as { __perf?: { lcp: number } }).__perf;
      return perf ? Math.round(perf.lcp) : 0;
    });
    hops.push({ route, newJsKB: Math.round(newBytes / 1024), newJsFiles: newFiles, lcpMs: lcp });
  }

  await context.close();
  const bytes = [...seen.values()].reduce((total, size) => total + size, 0);
  return { sessionJsKB: Math.round(bytes / 1024), sessionJsFiles: seen.size, hops };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const storageState = await captureStorageState(browser);
  console.log(`Signed in. Measuring ${ROUTES.length} routes x ${RUNS} runs (label: ${LABEL}${THROTTLE ? ", throttled: Fast 4G + 4x CPU" : ", unthrottled"})\n`);

  const results: Record<string, Record<string, number>> = {};

  for (const route of ROUTES) {
    const samples: RouteSample[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      samples.push(await measureRoute(browser, storageState, route));
      process.stdout.write(`\r  ${route}: run ${run + 1}/${RUNS}`);
    }
    process.stdout.write("\n");

    // Medians rather than means: a single GC pause or a stray long task
    // skews a 5-run mean badly, and the median is what a user typically sees.
    results[route] = {
      initialJsKB: Math.round(median(samples.map((s) => s.initialJsBytes)) / 1024),
      initialJsRequests: median(samples.map((s) => s.initialJsRequests)),
      jsKB: Math.round(median(samples.map((s) => s.jsBytes)) / 1024),
      jsRequests: median(samples.map((s) => s.jsRequests)),
      totalKB: Math.round(median(samples.map((s) => s.totalBytes)) / 1024),
      fcpMs: median(samples.map((s) => s.fcpMs)),
      lcpMs: median(samples.map((s) => s.lcpMs)),
      domContentLoadedMs: median(samples.map((s) => s.domContentLoadedMs)),
      loadMs: median(samples.map((s) => s.loadMs)),
      longTaskMs: median(samples.map((s) => s.longTaskMs)),
    };
  }

  console.log("\n  Measuring client-side navigation ...");
  const navigation = await measureNavigationRequests(browser, storageState);
  console.log("  Measuring whole-session JavaScript ...");
  const session = await measureSession(browser, storageState);
  await browser.close();

  const payload = { label: LABEL, baseUrl: BASE_URL, runs: RUNS, throttled: THROTTLE, capturedAt: new Date().toISOString(), routes: results, navigation, session };
  const outFile = resolve(OUT_DIR, `client-metrics-${LABEL}.json`);
  writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(`\n=== Client-side metrics (${LABEL}) ===`);
  const columns = ["initialJsKB", "initialJsRequests", "jsKB", "jsRequests", "fcpMs", "lcpMs", "domContentLoadedMs", "loadMs"];
  console.log(["route".padEnd(12), ...columns.map((c) => c.padStart(12))].join(" "));
  for (const [route, metrics] of Object.entries(results)) {
    console.log([route.padEnd(12), ...columns.map((c) => String(metrics[c]).padStart(12))].join(" "));
  }
  console.log(
    `\nnavigation over 2 laps: ${navigation.navigationBlockingRsc} blocking RSC fetches, ` +
      `${navigation.navigationPrefetchRsc} background prefetches, ${navigation.navigationElapsedMs} ms total`
  );
  console.log(`session across all three routes: ${session.sessionJsKB} KB of JS in ${session.sessionJsFiles} unique files`);
  console.log("per-hop (new JS downloaded on arriving at each route, one warm context):");
  for (const hop of session.hops) {
    console.log(`   ${hop.route.padEnd(12)} +${String(hop.newJsKB).padStart(5)} KB in ${String(hop.newJsFiles).padStart(2)} files   LCP ${hop.lcpMs} ms`);
  }
  console.log(`\nWrote ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
