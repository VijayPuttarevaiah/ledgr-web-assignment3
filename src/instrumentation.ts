/**
 * Next.js calls `register()` once per runtime during server bootstrap.
 * Only the Node.js runtime is instrumented — the Edge runtime has no
 * `node:http` server to observe and `prom-client` depends on Node APIs.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { installHttpMetricsHook } = await import("@/lib/metrics-http-hook");
  await installHttpMetricsHook();
}
