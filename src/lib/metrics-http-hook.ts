import "server-only";
import type { IncomingMessage, ServerResponse } from "node:http";
import { metrics, normalizeRoute } from "@/lib/metrics";

/**
 * Assignment 3 §5 — where the HTTP latency / error-rate numbers come from.
 *
 * Next.js gives no per-request server hook: `proxy.ts` (middleware) runs
 * *before* the handler and returns immediately, so timing it would measure
 * the proxy rather than the request, and wrapping ~30 route handlers by
 * hand would still miss page renders and static assets entirely.
 *
 * Patching `http.Server.prototype.emit` instead observes every request the
 * Node server accepts, at the same boundary a reverse proxy would measure,
 * so `http_request_duration_seconds` is true end-to-end server latency
 * (framework overhead included) for pages, API routes and bundles alike.
 * The patch is installed on the prototype rather than an instance, so it
 * works no matter whether Next has already created its server by the time
 * `instrumentation.ts` runs.
 */
const INSTALLED = Symbol.for("ledgr.metrics.httpHookInstalled");
const globalStore = globalThis as unknown as { [INSTALLED]?: boolean };

export async function installHttpMetricsHook(): Promise<void> {
  if (globalStore[INSTALLED]) return;
  globalStore[INSTALLED] = true;

  const http = await import("node:http");

  const originalEmit = http.Server.prototype.emit;
  http.Server.prototype.emit = function patchedEmit(
    this: unknown,
    event: string,
    ...args: unknown[]
  ) {
    if (event === "request") {
      const req = args[0] as IncomingMessage;
      const res = args[1] as ServerResponse;
      observe(req, res);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return originalEmit.apply(this as any, [event, ...args] as any);
  } as typeof http.Server.prototype.emit;
}

function observe(req: IncomingMessage, res: ServerResponse): void {
  const method = (req.method ?? "GET").toUpperCase();
  const startedAt = process.hrtime.bigint();

  let pathname = "/";
  try {
    pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    /* malformed URL — keep the "/" fallback rather than dropping the sample */
  }

  // The scrape itself is excluded: Prometheus polls every 5 s, so counting
  // it would swamp the request-rate and error-rate panels with traffic that
  // is an artefact of the monitoring rather than of the application.
  if (pathname === "/api/metrics") return;

  const route = normalizeRoute(pathname);
  metrics.httpRequestsInFlight.inc({ method });

  let settled = false;
  const finish = (statusOverride?: number) => {
    if (settled) return;
    settled = true;

    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const statusCode = String(statusOverride ?? res.statusCode ?? 0);
    const labels = { method, route, status_code: statusCode };

    metrics.httpRequestsInFlight.dec({ method });
    metrics.httpRequestDuration.observe(labels, durationSeconds);
    metrics.httpRequestsTotal.inc(labels);

    const status = Number(statusCode);
    if (status >= 400) {
      metrics.httpRequestErrorsTotal.inc({
        ...labels,
        class: status >= 500 ? "5xx" : "4xx",
      });
    }

    const written = Number(res.getHeader("content-length") ?? 0);
    if (Number.isFinite(written) && written > 0) {
      metrics.httpResponseSizeBytes.observe({ method, route }, written);
    }
  };

  res.on("finish", () => finish());
  // A client that hangs up mid-response never fires "finish"; without this
  // the in-flight gauge would ratchet upwards under an aborted JMeter run
  // and never come back down.
  res.on("close", () => finish(res.statusCode || 499));
}
