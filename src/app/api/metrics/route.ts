import { metricsContentType, renderMetrics } from "@/lib/metrics";

/**
 * Prometheus scrape target (Assignment 3 §5).
 *
 * Always dynamic: a cached/statically-rendered response would hand
 * Prometheus the same counter values on every scrape and every rate() in
 * Grafana would flatline to zero.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const body = await renderMetrics();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": metricsContentType(),
      "Cache-Control": "no-store",
    },
  });
}
