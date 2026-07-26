import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getAnalyticsSummary, type AnalyticsRange, type AnalyticsSummary } from "@/lib/analytics";
import { getCache } from "@/lib/cache/ttl-cache";

/**
 * Assignment 3 §2 — server-side optimisation 1, applied to the analytics
 * summary.
 *
 * `getAnalyticsSummary` is the most expensive read in the application. For a
 * single call it issues three queries, pulls every transaction in the
 * selected window into Node, and then walks that array five times to build
 * KPIs, a category breakdown, budget health and cash-flow buckets. In the
 * baseline run it was the slowest API sampler after the page renders, and
 * the "All" and "1Y" ranges pull nearly the user's whole history.
 *
 * It is also close to ideal caching material: the inputs change only when
 * the user records a transaction or edits a budget, it is read far more
 * often than it is written, and it is scoped per user, so the cache key is
 * simply user + range. A 60-second TTL keeps it visibly fresh — a user who
 * adds a transaction and switches to Analytics sees their change, because
 * the write path invalidates — while removing the recomputation from every
 * repeat view and from every concurrent viewer during a load test.
 */
const ANALYTICS_TTL_MS = 60_000;

const analyticsCache = getCache<AnalyticsSummary>({
  name: "analytics-summary",
  ttlMs: ANALYTICS_TTL_MS,
  maxEntries: 2_000,
});

export async function getCachedAnalyticsSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  range: AnalyticsRange
): Promise<AnalyticsSummary> {
  return analyticsCache.getOrLoad(`${userId}:${range}`, () => getAnalyticsSummary(supabase, userId, range));
}

/** Drops every cached range for one user. Called from the transaction and budget write paths. */
export function invalidateAnalyticsSummary(userId: string): void {
  analyticsCache.deleteByPrefix(`${userId}:`);
}
