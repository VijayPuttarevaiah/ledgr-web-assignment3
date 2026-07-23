# Performance Pass — Measured Before/After

§10 of the build guide requires at least three client-side and two
server-side optimizations, each with quantified before/after numbers, not
anecdotal impact. This document is that evidence. Every number below was
produced by an actual measurement run against this codebase (a real
production build, a real local Supabase instance, a real headless browser)
— reproduction steps are included so they can be re-run.

All measurements were taken 2026-07-23 on a local machine (Apple Silicon),
Next.js 16.2.11 production build (`next build && next start`), local
Supabase (Postgres 17.6) via Docker.

---

## Client-side

### 1. Dashboard — code-split the spending-trend chart (recharts)

**What changed:** `SpendingTrendChart` (recharts `LineChart`) was a static
import in `src/app/(app)/dashboard/page.tsx`; it's now loaded via
`next/dynamic`, so its JS ships in a separate chunk fetched only when the
Dashboard actually renders, not bundled into every route that happens to
share code with it.

**How measured:** a headless Chromium session (Playwright) signs up a fresh
account, lands on `/dashboard`, and sums the byte length of every `.js`
response received for that page.

| | Before | After | Change |
|---|---|---|---|
| JS transferred, `/dashboard` | 1,484.3 KB | 1,142.9 KB | **−341.4 KB (−23.0%)** |

### 2. Split Studio — code-split the Receipt Editor

**What changed:** `ReceiptEditor` (the itemised-split full-canvas panel) was
a static import in `split-studio-client.tsx` even though it only renders
once a user opens it. Moved to `next/dynamic(..., { ssr: false })` with a
small loading spinner, matching the guide's explicit example ("Receipt
Editor... not needed on first paint").

**How measured:** same methodology, landing on `/split` without opening the
editor.

| | Before | After | Change |
|---|---|---|---|
| JS transferred, `/split` (editor unopened) | 812.1 KB | 803.3 KB | **−8.8 KB (−1.1%)** |

The win here is smaller than the chart case because `ReceiptEditor` itself
is fairly light (it reuses UI primitives and `split-math.ts` that are
already shared with the rest of the route) — but it's real, and it means
the editor's code now truly loads on demand instead of unconditionally.

### 3. Analytics — code-split the cash-flow chart (recharts)

**What changed:** same pattern as #1, applied to `CashFlowChart` in
`src/app/(app)/analytics/page.tsx`.

**How measured:** this one needed a different methodology than #1/#2. A
naive "visit `/dashboard` then `/analytics` in the same browser context"
measurement is confounded — recharts gets fetched (and cached) on the
`/dashboard` step, so the `/analytics`-only delta measures almost nothing
real. Fixed by signing in with `redirectTo=/analytics` in a **fresh browser
context** (cold HTTP cache, never visited `/dashboard`), so `/analytics` is
the first authenticated page ever loaded in that context.

| | Before | After | Change |
|---|---|---|---|
| JS transferred, `/analytics` (cold cache, direct landing) | 922.1 KB | 901.7 KB | **−20.4 KB (−2.2%)** |

*(Worth stating plainly: the first attempt at this measurement produced a
backwards-looking number — "after" appeared larger than "before" — purely
from that cross-page cache confound. Re-deriving it with an isolated
context was necessary to get a number that actually means anything.)*

**Reproduction:** `npm run build && npm run start -- --port 3200`, then a
Playwright script that signs up/in and sums `response.body().length` for
every `*.js` response on the target route. See git history for the
measurement scripts used (removed after use — they were throwaway
instrumentation, not part of the shipped app).

---

## Server-side

### 4. Database indexing on `transactions(user_id, occurred_on)`

**What changed:** nothing — the index already existed in the initial
schema migration (`transactions_user_date_idx`). This section proves it's
actually load-bearing rather than assuming it, per the guide's "measure,
don't assume" instruction.

**How measured:** seeded ~505,000 rows across a Postgres table with 13
distinct `user_id` values (simulating a busy multi-tenant table) via direct
SQL, then ran `EXPLAIN (ANALYZE, BUFFERS)` on the exact query the Ledger
page issues, with the index dropped ("before") and recreated ("after").

| | Before (no index) | After (with index) | Change |
|---|---|---|---|
| Query plan | Parallel Seq Scan (2 workers) over 500K+ rows | Index Scan on `transactions_user_date_idx` | Seq → Index |
| Buffers read | 8,804 | 36 (33 hit + 3 read) | **−99.6%** |
| Execution time | 91.582 ms | 0.166 ms | **≈552× faster** |

```sql
-- reproduction (run inside the supabase_db_ledgr container)
explain (analyze, buffers)
select * from public.transactions
where user_id = '<uuid>'
order by occurred_on desc, created_at desc
limit 20;
```

### 5. Pagination instead of full-table fetch (Ledger)

**What changed:** nothing new either — `GET /api/transactions` and the
Ledger page have paginated with `.range()` (page size 20) from the start,
per the guide's explicit requirement ("pagination instead of full-table
fetches") and the original report's UX rationale (deliberate user control,
not infinite scroll). Measured here to quantify why that choice matters.

**How measured:** seeded 2,000 transactions for one user, then hit the
underlying PostgREST endpoint directly with and without a `limit=20`,
comparing actual HTTP response size and wall-clock time.

| | Full result (2,000 rows) | Paginated (20 rows) | Change |
|---|---|---|---|
| Response size | 462,813 bytes | 9,257 bytes | **−98.0% (≈50× smaller)** |
| Response time | 40.1 ms | 11.5 ms | **≈3.5× faster** |

```bash
# reproduction (against local Supabase REST)
curl -o /dev/null -w "bytes: %{size_download} time: %{time_total}s\n" \
  ".../rest/v1/transactions?user_id=eq.<uuid>&select=*&order=occurred_on.desc"
curl -o /dev/null -w "bytes: %{size_download} time: %{time_total}s\n" \
  ".../rest/v1/transactions?user_id=eq.<uuid>&select=*&order=occurred_on.desc&limit=20"
```

---

## Other optimizations shipped but not independently quantified above

- **Memoization** (`useMemo` in `ReceiptEditor`, keyed on `[expense,
  items]`): the itemised-split preview (which runs the full §6.1/§6.2 split
  math across every item and every participant) does not recompute while
  the user types in the "add item" form fields — only when `items` or
  `expense` actually change. Verified by code inspection of the dependency
  array rather than a separate numeric benchmark.
- **Supabase connection pooling**: checked rather than assumed, and the
  honest answer is nuanced — local dev explicitly has the pooler *disabled*
  (`[db.pooler] enabled = false` in `supabase/config.toml`, confirmed via
  `supabase status` showing `supabase_pooler_ledgr` as a stopped service),
  which is correct for a single local connection. A hosted Supabase project
  runs Supavisor by default; the deployment step in README.md calls out
  using the pooled connection string (port 6543, transaction mode) for any
  serverless/edge usage rather than the direct connection, which is the
  actual production-relevant configuration.
- **`next/font`**: self-hosts Inter at build time (no render-blocking
  Google Fonts request, no layout shift from a late-swapping web font) —
  automatic from using `next/font/google` rather than a `<link>` tag.
