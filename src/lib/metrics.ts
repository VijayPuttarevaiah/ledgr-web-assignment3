import "server-only";
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
  type Metric,
} from "prom-client";

/**
 * Assignment 3 §5 — Prometheus instrumentation.
 *
 * Next.js loads server modules more than once in a single process (the
 * route-handler graph, the instrumentation hook and the RSC graph are
 * separate module registries), so a plain module-level `new Registry()`
 * would give `/api/metrics` a *different* registry from the one the HTTP
 * timing hook writes into and the endpoint would report zeros forever.
 * Pinning the registry and every collector on `globalThis` makes them true
 * process singletons, which is what Prometheus's pull model assumes.
 */
type MetricsBundle = {
  registry: Registry;
  httpRequestDuration: Histogram<"method" | "route" | "status_code">;
  httpRequestsTotal: Counter<"method" | "route" | "status_code">;
  httpRequestErrorsTotal: Counter<"method" | "route" | "status_code" | "class">;
  httpRequestsInFlight: Gauge<"method">;
  httpResponseSizeBytes: Histogram<"method" | "route">;
  cacheOperationsTotal: Gauge<"cache" | "outcome">;
  cacheEntries: Gauge<"cache">;
  cacheHitRatio: Gauge<"cache">;
};

const GLOBAL_KEY = Symbol.for("ledgr.metrics.bundle");

function build(): MetricsBundle {
  const registry = new Registry();
  registry.setDefaultLabels({ app: "ledgr" });

  // process_cpu_seconds_total, process_resident_memory_bytes,
  // nodejs_heap_size_used_bytes, nodejs_eventloop_lag_seconds, ... — this is
  // where the CPU + memory panels in Grafana get their data.
  collectDefaultMetrics({ register: registry, prefix: "" });

  const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "End-to-end HTTP request latency handled by the Next.js server",
    labelNames: ["method", "route", "status_code"] as const,
    // Buckets chosen around the observed baseline: local API calls land in
    // the 20-500 ms band, page renders in the 100 ms-2 s band, so the
    // buckets need resolution in both without wasting series.
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests handled, labelled by method, route template and status code",
    labelNames: ["method", "route", "status_code"] as const,
    registers: [registry],
  });

  const httpRequestErrorsTotal = new Counter({
    name: "http_request_errors_total",
    help: "HTTP responses with a 4xx or 5xx status code",
    labelNames: ["method", "route", "status_code", "class"] as const,
    registers: [registry],
  });

  const httpRequestsInFlight = new Gauge({
    name: "http_requests_in_flight",
    help: "HTTP requests currently being served (concurrency)",
    labelNames: ["method"] as const,
    registers: [registry],
  });

  const httpResponseSizeBytes = new Histogram({
    name: "http_response_size_bytes",
    help: "Uncompressed size of HTTP response bodies",
    labelNames: ["method", "route"] as const,
    buckets: [500, 2_000, 10_000, 50_000, 200_000, 1_000_000, 5_000_000],
    registers: [registry],
  });

  // Assignment 3 §2 — the in-memory caches report their own effectiveness,
  // so the claim that they help is checkable from the dashboard rather than
  // only from a before/after load test.
  const cacheOperationsTotal = new Gauge({
    name: "ledgr_cache_operations_total",
    help: "Cumulative cache lookups by outcome (hit, miss, coalesced)",
    labelNames: ["cache", "outcome"] as const,
    registers: [registry],
  });

  const cacheEntries = new Gauge({
    name: "ledgr_cache_entries",
    help: "Entries currently held by each in-memory cache",
    labelNames: ["cache"] as const,
    registers: [registry],
  });

  const cacheHitRatio = new Gauge({
    name: "ledgr_cache_hit_ratio",
    help: "Share of lookups served without calling the upstream dependency",
    labelNames: ["cache"] as const,
    registers: [registry],
  });

  return {
    registry,
    httpRequestDuration,
    httpRequestsTotal,
    httpRequestErrorsTotal,
    httpRequestsInFlight,
    httpResponseSizeBytes,
    cacheOperationsTotal,
    cacheEntries,
    cacheHitRatio,
  };
}

const globalStore = globalThis as unknown as { [GLOBAL_KEY]?: MetricsBundle };
export const metrics: MetricsBundle = (globalStore[GLOBAL_KEY] ??= build());

/**
 * Collapses a concrete request path into a low-cardinality route template.
 *
 * Prometheus label values become time series, so leaving raw paths in
 * (`/api/groups/8f2c.../expenses/4a1b...`) would create an unbounded number
 * of series — one per UUID — and eventually take the scrape endpoint down.
 * Every dynamic segment the App Router declares is replaced with its
 * parameter name so the panels aggregate the way the routes are written.
 */
export function normalizeRoute(pathname: string): string {
  if (pathname.startsWith("/_next/static")) return "/_next/static/*";
  if (pathname.startsWith("/_next/image")) return "/_next/image";
  if (pathname.startsWith("/_next")) return "/_next/*";

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const segments = pathname.split("/").filter(Boolean);

  const mapped = segments.map((segment, index) => {
    if (UUID.test(segment)) {
      // Name the parameter after the collection that precedes it so the
      // template reads like the file-system route it came from.
      const parent = segments[index - 1];
      if (parent === "groups") return ":groupId";
      if (parent === "expenses") return ":expenseId";
      if (parent === "items") return ":itemId";
      if (parent === "members") return ":memberId";
      if (parent === "transactions") return ":id";
      if (parent === "recurring-rules") return ":id";
      return ":id";
    }
    if (segments[index - 1] === "invite" || segments[index - 1] === "invites") return ":token";
    return segment;
  });

  const normalized = `/${mapped.join("/")}`;
  return normalized === "/" ? "/" : normalized.replace(/\/$/, "");
}

export function metricsContentType(): string {
  return metrics.registry.contentType;
}

export async function renderMetrics(): Promise<string> {
  // The caches keep plain counters rather than prom-client metrics, so that
  // ttl-cache.ts stays runtime-agnostic (it is imported from the Edge
  // runtime too, where prom-client cannot load). Their state is copied into
  // the gauges at scrape time instead.
  const { allCacheStats } = await import("@/lib/cache/ttl-cache");
  for (const stat of allCacheStats()) {
    metrics.cacheOperationsTotal.set({ cache: stat.name, outcome: "hit" }, stat.hits);
    metrics.cacheOperationsTotal.set({ cache: stat.name, outcome: "miss" }, stat.misses);
    metrics.cacheOperationsTotal.set({ cache: stat.name, outcome: "coalesced" }, stat.coalesced);
    metrics.cacheEntries.set({ cache: stat.name }, stat.size);
    metrics.cacheHitRatio.set({ cache: stat.name }, stat.hitRatio);
  }
  return metrics.registry.metrics();
}

export type { Metric };
