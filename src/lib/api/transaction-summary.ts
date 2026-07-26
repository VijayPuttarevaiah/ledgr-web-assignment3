import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getCache } from "@/lib/cache/ttl-cache";

/**
 * Assignment 3 §2 — server-side optimisations 1 and 2, working together.
 *
 * The Ledger page and GET /api/transactions both need the same three
 * numbers: lifetime income, lifetime expenses, and a transaction count.
 * Both used to obtain them by selecting every one of the user's
 * transactions and reducing the array in JavaScript.
 *
 * That was wrong on two counts:
 *
 *   1. Correctness. PostgREST caps a response at `db-max-rows` (1,000 on a
 *      stock Supabase stack). The "fetch everything" query therefore stopped
 *      at 1,000 rows and the totals were silently short. On the load-test
 *      account it reported $127,868.12 of income instead of $578,074.05 —
 *      a 78% understatement, presented to the user as fact.
 *   2. Cost. 42 KB of JSON serialised, transferred and parsed per request,
 *      growing with the user's history, to produce 68 bytes of answer.
 *
 * `transaction_totals()` (migration 20260726000001) fixes both by computing
 * the aggregate inside Postgres. It is then wrapped in the TTL cache,
 * because measurement showed PostgREST's `/rpc/` path costs roughly 12 ms
 * per call on this stack against roughly 2.5 ms for a plain table read —
 * correct but not free. The cache turns that into a per-user cost paid once
 * per TTL rather than once per request, and the write paths invalidate it,
 * so a user never sees a stale total after their own edit.
 */
export interface TransactionTotals {
  income_cents: number;
  expense_cents: number;
  tx_count: number;
}

const TOTALS_TTL_MS = 60_000;

const totalsCache = getCache<TransactionTotals>({
  name: "transaction-totals",
  ttlMs: TOTALS_TTL_MS,
  maxEntries: 5_000,
});

function cacheKey(userId: string, from?: string | null, to?: string | null): string {
  return `${userId}:${from ?? ""}:${to ?? ""}`;
}

export async function getTransactionTotals(
  supabase: SupabaseClient<Database>,
  userId: string,
  range?: { from?: string | null; to?: string | null }
): Promise<TransactionTotals> {
  const from = range?.from ?? null;
  const to = range?.to ?? null;

  return totalsCache.getOrLoad(cacheKey(userId, from, to), async () => {
    const { data, error } = await supabase.rpc("transaction_totals", {
      p_from: from,
      p_to: to,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      income_cents: Number(row?.income_cents ?? 0),
      expense_cents: Number(row?.expense_cents ?? 0),
      tx_count: Number(row?.tx_count ?? 0),
    };
  });
}

/**
 * Drops every cached total for a user.
 *
 * Called from each write path. The cache is keyed by user *and* date range,
 * and a single new transaction moves the totals for every range that
 * contains it, so invalidating one key would leave the others stale. Keys
 * are prefixed with the user id precisely so this sweep stays scoped to the
 * user who wrote — one person adding a transaction never evicts anyone
 * else's cached totals.
 */
export function invalidateTransactionTotals(userId: string): void {
  totalsCache.deleteByPrefix(`${userId}:`);
}
