---
title: "Performance, Resilience and Security of Ledgr"
subtitle: "Advanced Web Development — Assignment 3"
author: "Vijay Puttarevaiah"
date: "27 July 2026"
---

# 1. Introduction and scope

Ledgr is the personal-finance and expense-splitting application I built for
this course. The front end is Next.js 16 with React Server Components; the
back end is Supabase, which bundles PostgreSQL 17 with row-level security,
GoTrue for authentication and PostgREST as the data API.

The assignment allows the work to focus on one or two features. I chose the
**personal ledger** (the Ledger page and the `/api/transactions` endpoints
behind it) and **analytics** (the Analytics page and
`/api/analytics/summary`). I picked these before taking any measurements,
because they read the most rows per request and so were the most likely to
degrade under load. The baseline confirmed that choice, and then turned up a
larger problem I had not anticipated.

Under 50 concurrent users the original build failed 22.4% of all requests.
After four optimisations it failed none, average latency dropped 52.5%,
95th-percentile latency dropped 58.6% and throughput rose 39.3%. The dominant
cause of the original failure was not slow application code. It was an
authentication call the application made on every request, to a service that
could not sustain that rate.

Repository: <https://github.com/VijayPuttarevaiah/ledgr-web-assignment3>

# 2. Test environment

Every number in this report came from the machine described in Table 1. I ran
the application as a production build (`next build` then `next start`) on
port 3100 throughout, never the development server.

**Table 1 — Test environment**

| Component | Detail |
|---|---|
| Hardware | Apple M4, 10 cores, 16 GB RAM |
| Operating system | macOS 26.5.1 (Darwin 25.5) |
| Runtime | Node.js 26.5.0, Next.js 16.2.11 |
| Database | PostgreSQL 17.6, Supabase local stack in Docker |
| Load generator | Apache JMeter 5.6.3 [1] on OpenJDK 24 |
| Security scanner | OWASP ZAP 2.17.0 [2], containerised |
| Monitoring | Prometheus [3] and Grafana 13.1.1 [4], containerised |

Two methodological decisions shaped everything that follows.

**The load test runs authenticated.** Ledgr redirects unauthenticated
requests to `/sign-in`, and the Supabase browser client performs sign-in in
JavaScript, writing the session into a chunked `sb-<ref>-auth-token` cookie.
JMeter cannot execute JavaScript, so it cannot sign in. Pointed at
`/dashboard` without a session it would have measured the login page several
thousand times and recorded every one as a pass. I therefore capture a
session once with a headless Chromium script and feed the cookie into the
test plan as a JMeter property. Every sampler also asserts on expected body
content, so a response that returns HTTP 200 but is the wrong page counts as
the failure it is.

**The dataset is realistic.** My demo seed holds 88 transactions. At that
size every query returns in well under a millisecond, PostgreSQL ignores
indexes in favour of sequential scans, and any optimisation would show a
difference too small to attribute. A separate deterministic script, using a
fixed PRNG seed, raises the primary account to 4,091 transactions across 36
months — roughly 3.7 entries a day, a heavy but plausible user. Because the
seed is fixed, the before and after runs measure identical data.

I also ran an identical 21-request warm-up before each JMeter execution.
Without it the first request to each route carries cold-JIT and
connection-pool cost, and the two runs would absorb different amounts of that
into their averages.

# 3. Baseline performance with JMeter

## 3.1 Test plan design

The plan holds two thread groups over one identical user journey: a **light
load** of 10 users ramped over 30 seconds, and a **moderate load** of 50
users ramped over 60 seconds. Both hold at full concurrency after the ramp,
120 seconds for light and 180 for moderate, so the percentiles describe
steady state rather than the ramp. I set the plan to run thread groups
consecutively so the moderate scenario never contends with the light one, and
split the resulting `.jtl` by thread-group name afterwards.

One iteration is one simulated session, covering the application entry point,
its JavaScript bundles and its key API endpoints:

1. `GET /dashboard` — the server-rendered dashboard document
2. Every JavaScript bundle that document references
3. `GET /api/analytics/summary?range=1M` — the aggregation endpoint
4. `GET /api/transactions?page=1` — the paginated ledger feed
5. `GET /ledger?page=1` — the server-rendered ledger page
6. `GET /api/transactions?page=2` — a user paging through history
7. `GET /analytics?range=3M` — analytics over a wider window
8. `GET /api/categories` — small reference data, included as a control
9. `GET /api/health` — a liveness probe that reaches the database

A Constant Timer of 500 ms provides think time between these steps. I did not
apply it inside the bundle loop, because browsers fetch a page's JavaScript
in parallel with no pause between files; think time there would model
something no user does.

Two design details are worth explaining. Next.js emits content-hashed chunk
filenames that change on every build, so hard-coding bundle URLs would have
broken the plan the moment I rebuilt — which is exactly what the assignment
requires between runs. Instead a Regular Expression Extractor scrapes chunk
URLs from the served HTML and a ForEach controller requests each one, which
is build-independent and mirrors browser behaviour. Second, the dashboard
document references each chunk several times, once as a `<script>` tag and
again inside the React Server Component flight payload, giving roughly 73
matches for roughly 16 distinct files. A short Groovy post-processor
de-duplicates the list, so the test does not inflate its own request count
fourfold.

I executed every run headlessly with `jmeter -n`, never from the GUI, and
generated JMeter's HTML dashboard from each result set.

## 3.2 Light load results

Table 2 shows the light scenario. Nothing fails and the numbers look
ordinary, which is the point of running it first.

**Table 2 — Baseline, light load (10 users, 30 s ramp, 5,642 samples)**

| Endpoint | Samples | Avg (ms) | p95 (ms) | Throughput (req/s) | Error % |
|---|---:|---:|---:|---:|---:|
| `GET /dashboard` | 237 | 112.2 | 162 | 1.99 | 0.00 |
| JS bundles | 3,792 | 2.7 | 9 | 31.96 | 0.00 |
| `GET /api/analytics/summary` | 233 | 47.5 | 69 | 1.98 | 0.00 |
| `GET /api/transactions` (p1) | 233 | 52.0 | 79 | 1.98 | 0.00 |
| `GET /ledger` | 233 | 99.4 | 145 | 1.98 | 0.00 |
| `GET /api/transactions` (p2) | 230 | 47.6 | 69 | 1.99 | 0.00 |
| `GET /analytics?range=3M` | 230 | 105.8 | 155 | 1.99 | 0.00 |
| `GET /api/categories` | 227 | 47.8 | 77 | 1.99 | 0.00 |
| `GET /api/health` | 227 | 6.9 | 13 | 1.99 | 0.00 |
| Dashboard load (doc + bundles) | 237 | 155.2 | 205 | 1.99 | 0.00 |
| **All samples** | **5,642** | **23.2** | **112** | **47.14** | **0.00** |

## 3.3 Moderate load results

Table 3 shows the moderate scenario, and it is a different picture entirely.
Figure 1 is JMeter's own dashboard for the same run, which is where these
figures come from.

**Table 3 — Baseline, moderate load (50 users, 60 s ramp, 26,444 samples)**

| Endpoint | Samples | Avg (ms) | p95 (ms) | Throughput (req/s) | Error % |
|---|---:|---:|---:|---:|---:|
| `GET /dashboard` | 1,667 | 97.5 | 330 | 9.27 | **52.55** |
| JS bundles | 13,248 | 3.2 | 10 | 73.83 | 0.00 |
| `GET /api/analytics/summary` | 1,664 | 53.6 | 173 | 9.28 | **51.98** |
| `GET /api/transactions` (p1) | 1,662 | 54.1 | 172 | 9.32 | **49.64** |
| `GET /ledger` | 1,654 | 94.1 | 324 | 9.27 | **51.75** |
| `GET /api/transactions` (p2) | 1,651 | 54.6 | 179 | 9.29 | **51.18** |
| `GET /analytics?range=3M` | 1,640 | 98.9 | 354 | 9.25 | **53.17** |
| `GET /api/categories` | 1,634 | 53.9 | 170 | 9.26 | **48.10** |
| `GET /api/health` | 1,624 | 5.9 | 12 | 9.25 | 0.00 |
| Dashboard load (doc + bundles) | 1,667 | 123.2 | 393 | 9.26 | **52.55** |
| **All samples** | **26,444** | **33.7** | **174** | **146.76** | **22.41** |

![Figure 1 — JMeter dashboard, baseline moderate load. APDEX 0.757, 22.41% errors.](figures/jmeter-dashboard-baseline-moderate.png)

Roughly half of every authenticated request failed. Latency degraded too,
with 95th percentiles roughly doubling or tripling against the light run, but
the error column is the finding that matters and its shape identifies the
cause. Two rows sit at 0.00%: the static JavaScript bundles and
`/api/health`. The bundles are served from disk and never authenticate.
`/api/health` uses the service-role client and never authenticates either.
Every row that failed is a row that verifies a session first.

## 3.4 Bottleneck analysis

### Bottleneck 1 — one authentication round-trip per request, sometimes three

`supabase.auth.getUser()` is not a local JWT signature check. It is an HTTPS
call to the Supabase Auth server, which then queries PostgreSQL. Ledgr called
it on every authenticated request, and more than once per page view:
`src/proxy.ts` called it to refresh the session cookie, the `(app)` layout
called it again to load the profile, and the page component called it a third
time. A single dashboard view therefore cost three round-trips to an external
service before any application work began.

The auth container's own logs over the baseline window confirm the
consequence. Of 16,713 calls to `GET /auth/v1/user`, **5,925 returned HTTP
500**, each carrying the same error:

```
unable to fetch records: failed to connect to
  host=supabase_db_ledgr user=supabase_auth_admin database=postgres:
  dial error (dial tcp 172.18.0.2:5432: connect: cannot assign requested address)
```

GoTrue had exhausted its connections to PostgreSQL. That figure, 5,925, is
the same number of failed assertions JMeter recorded. The application was not
slow; it was throttled by a dependency it called far more often than it
needed to. Even when the call succeeded it cost 20–80 ms, which accounts for
most of the 47–54 ms averages in Table 2.

This is the worst bottleneck because it is the only one producing *errors*
rather than latency, it affects every authenticated route equally, and it
scales with request count rather than data size. No amount of query tuning
would have addressed it.

### Bottleneck 2 — an unbounded table read to compute two numbers

Both `GET /api/transactions` and the Ledger page fetched the 20 rows the user
sees, then separately issued `select type, amount_cents from transactions
where user_id = ?` with **no limit**, pulling the account's entire history
into Node to sum it into an income total and an expense total. On the
load-test account that is 4,091 rows serialised to JSON, sent over HTTP,
parsed and reduced to two integers: 42 KB of transfer to produce 68 bytes of
answer, on every page view, growing with the user's history for a result that
never grows.

Investigating it exposed something worse than inefficiency. PostgREST caps
responses at `db-max-rows`, 1,000 on a stock Supabase stack [5], so the query
silently stopped at 1,000 rows. Measured directly against the REST API, the
old code reported **$127,868.12** of lifetime income where the correct figure
is **$578,074.05** — a 78% understatement shown to the user as fact. The
summary was not merely expensive; it was wrong for any account past a
thousand transactions.

### Bottleneck 3 — row-level security re-evaluated once per row

Analytics was the slowest page in the journey at 354 ms p95, and profiling
its queries exposed a cost affecting *every* query in the application.
Supabase's `auth.uid()` is not a constant; it expands to two
`current_setting()` lookups, a JSONB parse and a cast. Written bare inside a
policy predicate, as `using (user_id = auth.uid())`, which is how all 28 of
my policies were written, PostgreSQL treats it as a per-row filter and
performs all of that for every candidate row [6]. Running `EXPLAIN (ANALYZE,
BUFFERS)` as the `authenticated` role with a real JWT claim set shows the
expansion in full:

```
Seq Scan on transactions (actual time=0.029..2.854 rows=4091 loops=1)
  Filter: (user_id = (COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''),
           ((NULLIF(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'sub')))::uuid)
  Buffers: shared hit=76
Execution Time: 3.090 ms
```

That is 4,091 JSONB parses to answer a question whose answer depends on the
session, not the row. I rank it third because it costs milliseconds rather
than failed requests, but it is the most widely felt of the three: it taxes
every table and every query.

# 4. Client-side optimisations

JMeter measures how fast bytes leave the server. It cannot see what the
browser then does with them, so I measured these two changes with a headless
Chromium harness instead, reported in §4.3.

## 4.1 Optimisation 1 — a single shared chart chunk, plus lazy modals

Inspecting the built output showed Dashboard and Analytics each code-split
their charts, which is correct, but into *different* modules. Dashboard
lazily imported `spending-trend-chart.tsx`; Analytics lazily imported
`cash-flow-chart.tsx` and `category-pie-chart.tsx`. Each file imports
recharts, and a bundler cannot share code between two async chunks reached
from different entry points. The build therefore emitted two chunks of
**316 KB each, both containing a full copy of the charting library**. A user
who opens Dashboard and then clicks Analytics, the commonest path through the
app, downloaded and compiled the same library twice.

Routing both dynamic imports through one module gives the bundler a single
chunk to emit:

```tsx
// src/components/charts/index.tsx
export { SpendingTrendChart } from "@/components/dashboard/spending-trend-chart";
export { CashFlowChart }      from "@/components/analytics/cash-flow-chart";
export { CategoryPieChart }   from "@/components/analytics/category-pie-chart";

// both pages now resolve to the same async chunk
const SpendingTrendChart = dynamic(
  () => import("@/components/charts").then((m) => m.SpendingTrendChart)
);
const CashFlowChart = dynamic(
  () => import("@/components/charts").then((m) => m.CashFlowChart)
);
```

Two 316 KB chunks became one of 384 KB. Dashboard now also carries the two
Analytics chart components, which is a real cost, but that is a few kilobytes
of JSX against 316 KB of shared library.

Alongside this I moved three components that never appear on first paint to
`next/dynamic`. The most valuable is the new-entry modal. `AppShell` wraps
every authenticated route, so its static import placed the whole entry form —
category picker, receipt upload, AI categorisation client, validation — into
the shared bundle that Dashboard, Ledger, Analytics, Split and Settings all
download before rendering, in order to render nothing.

```tsx
const NewEntryPanel = dynamic(
  () => import("@/components/new-entry/new-entry-panel").then((m) => m.NewEntryPanel),
  { ssr: false }   // only reachable by a click, so no server markup to hydrate
);
```

I also enabled `optimizePackageImports` for `lucide-react`, `date-fns` and
`recharts`. These are barrel packages: `import { Home } from "lucide-react"`
imports an index module re-exporting over a thousand icon modules, and the
option rewrites such imports to their deep paths at build time [7].

## 4.2 Optimisation 2 — the client-side router cache

Next.js keeps an in-memory Router Cache holding the RSC payload for each
visited route, but its default lifetime for dynamic routes is **zero
seconds** [8]. Every navigation back to a page visited moments earlier goes
to the server for a fresh payload. On the baseline, six navigations across
three pages produced six blocking RSC fetches, which is no reuse at all.

```ts
// next.config.ts
experimental: {
  optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
  staleTimes: { dynamic: 30, static: 180 },
}
```

I chose 30 seconds against how the application is actually used. Someone
moving between Dashboard, Ledger and Analytics is reading the same figures,
and every write path already calls `router.refresh()` — I verified this in
`ledger-table.tsx`, `nav-bar.tsx`, `group-detail.tsx` and
`split-studio-client.tsx` — which busts the cache regardless of stale time.
Financial figures therefore still cannot go stale behind the user's own
edits, which is the only staleness that would matter here.

## 4.3 Measured client-side impact

I measured with a headless Chromium harness, five runs per route, medians
reported, each route loaded in a **fresh browser context with an empty
cache**. Measuring several routes in one context is the classic trap: shared
chunks are already cached by the time the second route loads, so the second
route looks free and the numbers mean nothing.

Critically, I took this comparison with the *server-side* optimisations
already in place on both sides, by temporarily reverting only the four
client-side changes. Otherwise the server-side gains would have been
misattributed to client-side work.

**Table 4 — Client-side rendering metrics (medians of 5 runs)**

| Metric | Before | After | Change |
|---|---:|---:|---|
| **Session JS, all three routes** (one context, unique files) | **1,558 KB / 20 files** | **1,174 KB / 15 files** | **−384 KB (−24.6%)** |
| **Blocking RSC fetches**, 2 navigation laps | **6** | **2** | **−67%** |
| `/analytics` first load, cold cache | 1,184 KB / 16 files | 1,163 KB / 14 files | −21 KB |
| `/ledger` first load, cold cache | 784 KB / 12 files | 779 KB / 12 files | −5 KB |
| `/dashboard` first load, cold cache | 1,147 KB / 15 files | 1,156 KB / 13 files | +9 KB |

The two bold rows are what the optimisations targeted and both moved
substantially. The per-route rows are close to flat, and Dashboard is 9 KB
*worse* — that is the deliberate trade from §4.1, where Dashboard absorbs two
extra chart components in exchange for the session-wide saving. The session
figure is what matters for a real user, because a real user visits more than
one page.

First Contentful Paint and Largest Contentful Paint landed between 40 ms and
64 ms in both configurations, with run-to-run variation larger than the
difference between builds. I make no claim of improvement from them. Once the
server-side work removed the auth round-trip from the render path, these
pages were already painting fast enough over loopback that bundle size was no
longer the binding constraint. On a real network the 384 KB would matter
considerably more.

# 5. Server-side optimisations

## 5.1 Optimisation 3 — in-memory caching with request coalescing

The fix for Bottleneck 1 is to stop asking the auth server the same question
several times a second. `src/lib/cache/ttl-cache.ts` implements a TTL cache
with LRU eviction and, importantly, **request coalescing**:

```ts
async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
  const cached = this.get(key);
  if (cached !== undefined) { this.hits += 1; return cached; }

  const pending = this.inFlight.get(key);
  if (pending) { this.coalesced += 1; return pending; }   // single flight

  this.misses += 1;
  const promise = load()
    .then((value) => { this.set(key, value); return value; })
    .finally(() => { this.inFlight.delete(key); });
  this.inFlight.set(key, promise);
  return promise;
}
```

The coalescing half matters as much as the caching half. Under the moderate
scenario 50 users arrive at nearly the same instant. With a plain cache all
50 miss simultaneously and all 50 issue the same expensive call, so the cache
only starts helping from the 51st request — precisely the thundering herd
that brought GoTrue down. Holding the in-flight promise in the map means the
first caller does the work and the other 49 await its result. Failures are
never cached, because only the `.then` path stores a value, so a transient
auth outage cannot pin a user to a 401 for the rest of the TTL.

I deliberately did not use Redis. The whole point is to remove a network
round-trip from the hot path, and swapping an HTTPS call to Supabase for a
TCP call to Redis reintroduces most of the cost. The trade-off is that the
cache is per-process, so a multi-instance deployment gets one cache per
instance, which is acceptable for data that is only ever seconds fresh.

The cache is applied in three places: session verification with a 30-second
TTL, the analytics summary at 60 seconds, and the transaction totals at 60
seconds. Session entries are keyed on a SHA-256 hash of the session cookie
rather than the cookie itself, so a heap dump does not yield a set of live
access tokens:

```ts
export async function getVerifiedUser(supabase: SupabaseClient<Database>) {
  const cookieStore = await cookies();
  const sessionKey = sessionKeyFromCookies(cookieStore.getAll());
  if (!sessionKey) return null;           // no cookie: no cache, no network call

  const key = await hashKey(sessionKey);
  try {
    return await sessionCache.getOrLoad(key, async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) throw error ?? new Error("no user in session");
      return user;
    });
  } catch { return null; }
}
```

**The security trade-off.** Caching an authentication decision means caching
it for up to 30 seconds, so I want to be explicit about what that does and
does not cover. Signing out remains immediate: supabase-js clears the cookie
in the browser, the cookie value *is* the cache key, and a request with no
session cookie short-circuits before the cache is consulted. A refreshed
token likewise produces a different cookie value, so a different key, and is
re-verified at once. What the window genuinely covers is server-side
revocation — an administrator invalidating a session is honoured up to 30
seconds late. I chose 30 seconds to be small against the one-hour
access-token lifetime while still collapsing essentially all per-request
round-trips.

The analytics and totals caches are invalidated explicitly from every write
path rather than left to expire. I invalidate on transaction create, update,
delete and bulk delete, and on budget writes, since budget health forms part
of the cached analytics summary. Bulk re-categorisation invalidates analytics
but not totals, because moving spend between categories changes the breakdown
without changing income or expense sums. A user therefore never sees a figure
that predates their own edit.

## 5.2 Optimisation 4 — database indexing and query optimisation

Three changes at the database layer, across two migrations.

**(a) Row-level security evaluated once per statement.** Wrapping
`auth.uid()` in a scalar subquery makes PostgreSQL hoist it into an InitPlan,
evaluated once and then compared as a plain UUID constant [6]. That also
makes the predicate index-compatible, because `user_id = <constant>` can
drive an index scan while `user_id = <volatile expression>` cannot. I
generated the migration from `pg_policies` so no policy was missed; it
rewrites all 28:

```sql
alter policy transactions_select_own on public.transactions
  using ((user_id = (select auth.uid())));
-- ... 27 more, one per policy
```

This rewrites the *predicate*, not the *rule*. Each policy still admits
exactly the same rows for exactly the same users, which is why it is safe to
apply everywhere at once. Table 5 gives the effect, measured as the
`authenticated` role with a real JWT claim set.

**Table 5 — Effect of the RLS InitPlan rewrite (4,091-row account)**

| Query | Before | After | Change |
|---|---|---|---|
| `select count(*) from transactions` | 3.090 ms | 0.442 ms | **7.0× faster** |
| — query plan | Seq Scan | Index Only Scan | — |
| — shared buffers hit | 76 | 8 | **−89%** |
| Ledger page 101 (`offset 2000`) | 3.733 ms | 1.652 ms | **2.3× faster** |

**(b) A composite index matching the ledger's sort order.** Both the Ledger
page and `GET /api/transactions` read `... where user_id = ? order by
occurred_on desc, created_at desc limit 20 offset ?`. The pre-existing
`transactions_user_date_idx (user_id, occurred_on desc)` stopped one column
short, so PostgreSQL had to sort on top of the index scan — an Incremental
Sort on page 1, and past the first few pages it abandoned the index entirely
for a sequential scan plus a top-N heapsort of the whole account. Extending
the index to the full sort key turns both into an ordered index walk with no
sort node: the leading column filters and the trailing columns satisfy the
ordering, so PostgreSQL can skip the sort [9].

```sql
create index if not exists transactions_user_ledger_idx
  on public.transactions (user_id, occurred_on desc, created_at desc)
  include (type, amount_cents);
```

**Table 6 — Effect of the composite index (EXPLAIN ANALYZE, 4,091 rows)**

| Query | Before | After | Change |
|---|---|---|---|
| Page 1 (`limit 20 offset 0`) | 0.265 ms, Incremental Sort | 0.081 ms, Index Scan | **3.3× faster** |
| Page 101 (`limit 20 offset 2000`) | 2.139 ms, Seq Scan + heapsort | 0.748 ms, Index Scan | **2.9× faster** |

**(c) Aggregation pushed into PostgreSQL.** I replaced the unbounded read
from Bottleneck 2 with a `stable`, `security invoker` function scoped on
`auth.uid()`, so row-level security applies exactly as it does to a direct
query and a caller cannot request another user's totals:

```sql
create or replace function public.transaction_totals(
  p_from date default null, p_to date default null
) returns table (income_cents bigint, expense_cents bigint, tx_count bigint)
language sql stable security invoker set search_path = public as $$
  select
    coalesce(sum(amount_cents) filter (where type = 'income'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where type = 'expense'), 0)::bigint,
    count(*)::bigint
  from public.transactions
  where user_id = auth.uid()
    and (p_from is null or occurred_on >= p_from)
    and (p_to   is null or occurred_on <= p_to);
$$;
```

Measured over PostgREST the response payload falls from **42,158 bytes to 68
bytes, a 99.8% reduction** — and, more importantly, the totals become correct
for accounts above the row cap.

Two caveats belong here rather than in a footnote. First, PostgREST's `/rpc/`
path is not free: measured in isolation it costs roughly 12 ms per call
against roughly 2.5 ms for a plain table read, so swapping the query alone
would have traded a correctness bug for a latency regression. That is exactly
why the aggregate is wrapped in the cache from §5.1. The two optimisations
are complementary rather than independent — correctness comes from the
database, latency from not asking it twice in the same minute.

Second, on the demo database the load-test account owns 99% of the table, and
at that distribution a sequential scan genuinely *is* the right plan. The
index changes nothing for the summary aggregate there, and reporting it as a
win would be false. Reproducing a realistic multi-tenant distribution, by
inserting 200,000 rows across every account inside a transaction I then
rolled back so the measured dataset stayed identical, makes the planner
switch to an index scan as expected. Both results are in the repository.

# 6. Performance comparison

I re-ran the identical test plan against the optimised build, with the same
warm-up, the same seeded data and the same two scenarios. Percentages
throughout use:

- Latency improvement = (before − after) ÷ before × 100
- Throughput improvement = (after − before) ÷ before × 100

## 6.1 Light load

**Table 7 — Light load, baseline versus optimised**

| Endpoint | Avg before | Avg after | Δ avg | p95 before | p95 after | Δ p95 |
|---|---:|---:|---:|---:|---:|---:|
| `GET /api/analytics/summary` | 47.5 ms | 1.8 ms | **−96.2%** | 69 ms | 4 ms | **−94.2%** |
| `GET /api/transactions` (p1) | 52.0 ms | 9.5 ms | **−81.7%** | 79 ms | 20 ms | **−74.7%** |
| `GET /ledger` | 99.4 ms | 20.7 ms | **−79.2%** | 145 ms | 38 ms | **−73.8%** |
| `GET /analytics?range=3M` | 105.8 ms | 23.6 ms | **−77.7%** | 155 ms | 45 ms | **−71.0%** |
| `GET /api/categories` | 47.8 ms | 11.2 ms | **−76.6%** | 77 ms | 22 ms | **−71.4%** |
| `GET /api/transactions` (p2) | 47.6 ms | 11.2 ms | **−76.5%** | 69 ms | 23 ms | **−66.7%** |
| `GET /dashboard` | 112.2 ms | 38.6 ms | **−65.6%** | 162 ms | 62 ms | **−61.7%** |
| Dashboard load (doc + bundles) | 155.2 ms | 71.3 ms | **−54.1%** | 205 ms | 96 ms | **−53.2%** |
| JS bundles | 2.7 ms | 2.3 ms | −14.8% | 9 ms | 8 ms | −11.1% |
| `GET /api/health` | 6.9 ms | 10.3 ms | *+49.3%* | 13 ms | 21 ms | *+61.5%* |
| **All samples** | **23.2 ms** | **7.2 ms** | **−69.0%** | **112 ms** | **32 ms** | **−71.4%** |

![Figure 2 — Average response time by endpoint, light load.](figures/light-avg-comparison.png)

Every authenticated endpoint improved by between 65% and 96%, and the
gradient across those rows is itself informative.
`/api/analytics/summary` improved most, at −96.2%, because it gained both the
removed auth round-trip *and* a cached aggregate. `/api/categories` gained
only the removed auth round-trip and improved 76.6%, which makes that 76.6% a
reasonably clean estimate of what the session cache alone is worth.

`/api/health` is the one row that got slower, and it is worth explaining
rather than hiding. It is the only endpoint in the journey that never
authenticated, so it had nothing to gain from the main optimisation.
Meanwhile the optimised server pushes considerably more successful traffic
through the same event loop, so a request doing no cacheable work now queues
slightly longer behind requests that do. Losing 3.4 ms on a liveness probe to
gain 40–90 ms on every user-facing endpoint is a trade worth making, but it
is a genuine regression and I report it as one.

## 6.2 Moderate load

**Table 8 — Moderate load, baseline versus optimised**

| Endpoint | Avg before | Avg after | Δ avg | p95 before | p95 after | Δ p95 | Err before | Err after |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /api/analytics/summary` | 53.6 ms | 3.7 ms | **−93.1%** | 173 ms | 14 ms | **−91.9%** | 51.98% | **0%** |
| `GET /api/transactions` (p1) | 54.1 ms | 15.4 ms | **−71.5%** | 172 ms | 48 ms | **−72.1%** | 49.64% | **0%** |
| `GET /api/transactions` (p2) | 54.6 ms | 16.1 ms | **−70.5%** | 179 ms | 39 ms | **−78.2%** | 51.18% | **0%** |
| `GET /api/categories` | 53.9 ms | 16.6 ms | **−69.2%** | 170 ms | 58 ms | **−65.9%** | 48.10% | **0%** |
| `GET /analytics?range=3M` | 98.9 ms | 45.6 ms | **−53.9%** | 354 ms | 105 ms | **−70.3%** | 53.17% | **0%** |
| `GET /ledger` | 94.1 ms | 53.6 ms | **−43.0%** | 324 ms | 121 ms | **−62.7%** | 51.75% | **0%** |
| `GET /dashboard` | 97.5 ms | 95.4 ms | −2.2% | 330 ms | 246 ms | **−25.5%** | 52.55% | **0%** |
| JS bundles | 3.2 ms | 6.8 ms | *+112.5%* | 10 ms | 29 ms | *+190%* | 0% | 0% |
| `GET /api/health` | 5.9 ms | 10.9 ms | *+84.7%* | 12 ms | 32 ms | *+166.7%* | 0% | 0% |
| **All samples** | **33.7 ms** | **16.0 ms** | **−52.5%** | **174 ms** | **72 ms** | **−58.6%** | **22.41%** | **0%** |

Throughput rose from **146.76 to 204.44 requests per second, +39.3%**, while
the error rate fell from **22.41% to zero**. Figure 3 shows the
95th-percentile improvement by endpoint and Figure 4 shows throughput and
error rate together. Figure 5 is JMeter's dashboard for the optimised run,
directly comparable with Figure 1: the pass/fail pie is entirely green.

![Figure 3 — 95th-percentile response time by endpoint, moderate load.](figures/moderate-p95-comparison.png)

![Figure 4 — Throughput and error rate, moderate load.](figures/moderate-throughput-errors.png)

![Figure 5 — JMeter dashboard, optimised moderate load. 0% errors.](figures/jmeter-dashboard-optimized-moderate.png)

## 6.3 Analysis

The improvement is larger at 50 users than at 10, and that is the expected
shape rather than a lucky result. At light load the auth round-trip is pure
added latency, so removing it subtracts a roughly fixed cost. At moderate
load the same round-trip was also *saturating* a shared downstream resource,
so removing it recovers both the latency and all the queueing and failure
behaviour that saturation caused. Removing work from a contended system pays
more than removing the same work from an idle one.

The endpoint that improved most, `/api/analytics/summary` at −93.1%, is the
one where cache and aggregate compound: the round-trip disappears and the
remaining computation is a dictionary lookup rather than a scan-and-reduce
over every transaction in the window. The endpoint that improved least among
authenticated routes, `/dashboard` at −2.2% average, is the one doing the
most work the optimisations did not touch. It still renders six independent
data regions server-side, and only its auth cost and its RLS predicate got
cheaper. Its p95 nevertheless fell 25.5%, which is the queueing improvement
showing up where the average hides it.

**A caveat about the static-asset rows.** The JS-bundle row appears to have
regressed sharply, and the honest explanation is that the two runs did not
serve the same request mix, because the baseline was failing half its
requests. When a baseline dashboard request was redirected to `/sign-in` it
returned a short document with no chunk URLs to extract, so the ForEach loop
ran zero times for that iteration. The baseline therefore served 13,248
bundle requests; the optimised run, where every dashboard load succeeds,
served **23,520, 78% more**. Total samples rose from 26,444 to 36,775. The
optimised server does strictly more successful work per second, and
per-sample static-file latency rose under that heavier real load. The
comparison remains sound and strongly favourable, since every user-facing
endpoint is faster and none fail, but these particular rows are not
like-for-like and presenting them as such would mislead.

## 6.4 Attribution

Because I applied the optimisations together, no single JMeter row isolates
one of them. Combining the load-test rows with the direct measurements in
§4.3 and §5 gives the attribution in Table 9.

**Table 9 — What each optimisation contributed**

| Optimisation | Evidence | Contribution |
|---|---|---|
| Session cache (§5.1) | `/api/categories`, which gained *only* this, improved 76.6% | Eliminated all 22.41 pp of error rate; largest single contributor |
| Analytics + totals caches (§5.1) | `/api/analytics/summary` improved 96.2% against 76.6% for categories | A further ~20 pp of latency reduction on aggregation endpoints |
| RLS InitPlan rewrite (§5.2a) | 7.0× on `count(*)`, 89% fewer buffers | Cheaper on every cache miss, across every query |
| Composite index (§5.2b) | 3.3× on page 1, 2.9× on page 101 | Ledger pagination, most visible on deep pages |
| Aggregate pushdown (§5.2c) | 42,158 → 68 bytes; totals corrected | Correctness first, latency via the cache |
| Shared chart chunk (§4.1) | Session JS −24.6% | Cross-route navigation cost |
| Router cache (§4.2) | Blocking RSC fetches 6 → 2 | Repeat navigation |

# 7. Security scan and remediation

## 7.1 Methodology

I drove ZAP through its Automation Framework inside the official container,
entirely headless. Three adjustments were necessary, and each says something
about scanning this kind of application.

**The scan runs authenticated.** I tried `zap-baseline.py` with no session
first; it reported 61 passing rules and no failures. That result is
worthless. `src/proxy.ts` redirects every protected route to `/sign-in`, so
ZAP had crawled the login page and pronounced the application clean without
ever seeing it. Injecting the captured session cookie through a `replacer`
job takes the spider to 79 URLs across the real application.

**Static bundles are out of scope.** The Suspicious Comments passive rule
reads every response line by line. On the 392 KB chart bundle it took up to
114 seconds per pass and the scan never terminated. Excluding
`/_next/static/`, which holds files with no parameters and so no attack
surface, lets the scan finish in minutes and cover more of the real
application per unit time.

**The DOM-XSS rule is disabled.** Rule 40026 drives a headless Firefox inside
the container, and on this stack it repeatedly killed the ZAP daemon
mid-scan; the wrapper then lost its proxy connection and exited without
writing a report. Reflected and persistent XSS are still actively tested by
rules 40012, 40014, 40016 and 40017, all of which completed.

## 7.2 Findings

The scan reported eight distinct alerts: three Medium, one Low and four
Informational. Table 10 lists all of them, including those I did not fix.
Figure 6 shows ZAP's own report.

**Table 10 — All alerts, pre-remediation scan (26 July 2026, 23:32 UTC)**

| Alert | Risk (confidence) | Instances | CWE | Rule |
|---|---|---:|---:|---:|
| CSP: `script-src unsafe-inline` | **Medium** (High) | 5 | 693 | 10055 |
| CSP: `style-src unsafe-inline` | **Medium** (High) | 5 | 693 | 10055 |
| Format String Error | **Medium** (Medium) | 1 | 134 | 30002 |
| Big Redirect Detected | Low (Medium) | 1 | 201 | 10044 |
| Content-Type Header Missing | Informational (Medium) | 3 | 345 | 10019 |
| Modern Web Application | Informational (Medium) | 1 | — | 10109 |
| User Agent Fuzzer | Informational (Medium) | 3 | 0 | 10104 |
| User Controllable HTML Element Attribute | Informational (Low) | 1 | 20 | 10031 |

![Figure 6 — ZAP report before remediation: three Medium findings.](figures/zap-report-before.png)

## 7.3 Fix 1 — unvalidated input reflected into a response header

ZAP raised this as a Format String Error on the CSV export endpoint, having
sent a `%n%s%n%s…` payload as the `filter` query parameter and seen it come
back changed. The label is misleading, since Node has no `printf` to attack,
but the defect the probe exposed is real and worse than a format string. The
handler read `filter` off the query string, never validated it, then
interpolated it into an HTTP **response header**:

```ts
// before — src/app/api/transactions/export/route.ts
const filter = url.searchParams.get("filter") ?? "all";
return new Response(csv, {
  headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="ledgr-transactions-${filter}.csv"`,
  },
});
```

That is attacker-controlled data in a header. At best a crafted value breaks
out of the quoted `filename` and dictates what the victim's browser saves the
download as; at worst it is an attempt at HTTP response splitting [10]. Node
rejects the most blatant CRLF payloads by throwing, turning the request into
a 500 rather than a compromise, but relying on the runtime to catch it is not
a control.

The fix removes the trust rather than sanitising it. `filter` is checked
against the same five-value allowlist the Ledger UI can produce, so only one
of five known-safe literals reaches the header:

```ts
// after
const ALLOWED_FILTERS = ["all", "income", "expenses", "recurring", "shared"] as const;
type Filter = (typeof ALLOWED_FILTERS)[number];

const requested = url.searchParams.get("filter") ?? "all";
const filter: Filter = (ALLOWED_FILTERS as readonly string[]).includes(requested)
  ? (requested as Filter)
  : "all";
```

## 7.4 Fix 2 — `style-src 'unsafe-inline'` in the Content Security Policy

The policy shipped `style-src 'self' 'unsafe-inline'`, telling the browser to
honour any inline style it receives. Before changing it I checked the
assumption behind the fix rather than assuming it: the built HTML contains
**zero inline `<style>` tags and one external stylesheet link**, because
Tailwind v4 compiles to a real `.css` file. `'unsafe-inline'` was surplus
permission and could simply be dropped.

One genuine need remained. The application paints user-chosen category
colours with inline style *attributes*, as `style={{ background: category.color }}`,
which no nonce can cover, since nonces apply to elements and not attributes.
Rather than reinstate blanket `'unsafe-inline'`, I separated the two cases
using the directive that exists for exactly this [11]:

```
style-src 'self' 'nonce-<per-request>';
style-src-attr 'unsafe-inline';
```

An inline style attribute cannot execute script, so the residual exposure is
limited to CSS-based exfiltration, categorically smaller than what the old
directive permitted. I added `object-src 'none'` at the same time.

## 7.5 Fix 3 — oversized redirect and missing Content-Type

`GET /` was handled by a Server Component whose only job was to call
`redirect()`. Next.js answers that with a 307 *and* a full HTML body, which
is what ZAP flagged: a redirect carrying a response body may leak that body
to a client about to be sent elsewhere. The redirect now happens in the
proxy, producing a bodyless response with headers set explicitly:

```ts
const redirectTo = (url: URL) => {
  const redirect = NextResponse.redirect(url);
  redirect.headers.set("Content-Security-Policy", documentCsp);
  redirect.headers.set("Content-Type", "text/plain; charset=utf-8");
  return redirect;
};
```

This also removes a full page render from the busiest entry point, so it is a
small performance win as well.

## 7.6 The finding I did not fix

`script-src 'unsafe-inline'` remains open and I want to account for that
rather than pass over it.

The correct remedy is a per-request nonce, and I implemented it rather than
merely considering it. `src/proxy.ts` generates a 128-bit nonce per response
and sets it on both the request and response `Content-Security-Policy`
headers in the form Next.js documents [12]; I verified the header arrived
intact. Next.js 16.2.11 then did not stamp that nonce onto the inline scripts
it emits. Measured on the built output: **7 inline `<script>` tags per
document, 0 carrying a nonce**. The browser did what it was told and refused
all seven, hydration never ran, and the sign-in page rendered with no form.

Two further attempts failed for instructive reasons:

- Adding `'strict-dynamic'` made things worse. That keyword tells the browser
  to ignore host-source allowlists including `'self'` [11], so on pages that
  could not receive a nonce even the ordinary `<script src="/_next/...">`
  bundles were refused.
- Writing `script-src 'self' 'unsafe-inline' 'nonce-…'` as a belt-and-braces
  policy does not behave as it reads. Per the CSP specification, a browser
  seeing *any* nonce in a directive **discards `'unsafe-inline'` entirely**
  [11]. The application broke exactly as if `'unsafe-inline'` had never been
  written.

Shipping a policy that breaks authentication is worse than shipping one with
a declared weakness, so `script-src` keeps `'unsafe-inline'`. The nonce
plumbing stays in place and serves `style-src`, so the remaining work is to
apply the nonce to script tags, not to build the mechanism.

## 7.7 Verification re-scan

I re-ran the identical scan against the rebuilt application twenty minutes
later. Table 11 compares the two and Figure 7 shows the post-fix report.

**Table 11 — ZAP findings before and after remediation**

| Alert | Before | After |
|---|---|---|
| CSP: `script-src unsafe-inline` | Medium (×5) | Medium (×5), declared in §7.6 |
| CSP: `style-src unsafe-inline` | Medium (×5) | **Resolved** |
| Format String Error | Medium (×1) | **Resolved** |
| Big Redirect Detected | Low (×1) | **Resolved** |
| Modern Web Application | Informational (×1) | **Resolved** |
| Content-Type Header Missing | Informational (×3) | Informational (×1) |
| User Agent Fuzzer | Informational (×3) | Informational (×3) |
| User Controllable HTML Element Attribute | Informational (×1) | Informational (×1) |
| **Totals** | **3 Medium, 1 Low, 4 Info** | **1 Medium, 0 Low, 3 Info** |

![Figure 7 — ZAP report after remediation: Medium findings down from three to one.](figures/zap-report-after.png)

Two Medium findings and one Low closed, confirmed by re-scan. I also verified
the application still works under the tightened policy rather than assuming
it: a headless browser signs in, visits all five authenticated pages and
opens the lazily-loaded modal, reporting **0 CSP violations and 0 console
errors**.

# 8. Monitoring with Prometheus and Grafana

## 8.1 Instrumentation

Getting per-request metrics out of Next.js is not straightforward. Middleware
runs *before* the handler and returns immediately, so timing it measures the
middleware rather than the request; wrapping thirty route handlers by hand
would still miss page renders and static assets. I instead observe the Node
HTTP server itself from `src/instrumentation.ts`, which Next.js calls once
during bootstrap:

```ts
const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function patchedEmit(this, event, ...args) {
  if (event === "request") observe(args[0] as IncomingMessage, args[1] as ServerResponse);
  return originalEmit.apply(this, [event, ...args]);
};
```

This observes every request the server accepts, at the boundary a reverse
proxy would measure, so `http_request_duration_seconds` is true end-to-end
server latency including framework overhead, for pages, API routes and
bundles alike. Patching the prototype rather than an instance means it works
whether or not Next has already created its server.

I collapse route labels to templates such as `/api/groups/:groupId/expenses`
before they become Prometheus labels. Leaving raw paths in would create one
time series per UUID and would eventually bring the scrape endpoint down [3].

`/api/metrics` exposes `http_request_duration_seconds` as a histogram by
method, route and status, plus `http_requests_total`,
`http_request_errors_total` by 4xx/5xx class, `http_requests_in_flight`,
`http_response_size_bytes`, three `ledgr_cache_*` gauges reporting each
in-memory cache's hit ratio, and prom-client's default process collectors
[13] — `process_cpu_seconds_total`, `process_resident_memory_bytes`,
`nodejs_heap_size_used_bytes` and `nodejs_eventloop_lag_p99_seconds` — which
feed the CPU and memory panels.

## 8.2 Prometheus configuration

`prometheus.yml` defines three scrape jobs: the application, node-exporter
for host metrics, and Prometheus itself. I set a 5-second scrape interval
rather than the 15-second default, because a JMeter scenario runs for two to
three minutes and at 15 seconds a `rate()` window has too few points to draw
the ramp.

```yaml
global:
  scrape_interval: 5s
scrape_configs:
  - job_name: ledgr-app
    metrics_path: /api/metrics
    static_configs:
      - targets: ["host.docker.internal:3100"]
        labels: { service: ledgr, env: local }
  - job_name: node-exporter
    static_configs:
      - targets: ["node-exporter:9100"]
        labels: { service: host, env: local }
```

`alert-rules.yml` adds three recording rules and four alerts:
`LedgrHighErrorRate` above 5% for 2 minutes, `LedgrHighLatency` with p95 over
1 second for 2 minutes, `LedgrHighMemory` above 1.5 GB RSS, and `LedgrDown`.
Figure 8 shows all three targets healthy.

![Figure 8 — Prometheus targets, all three scrape jobs up.](../monitoring/screenshots/prometheus-targets.png)

![Figure 9 — The four alert rules loaded from alert-rules.yml, all inactive against a healthy service.](../monitoring/screenshots/prometheus-alerts.png)

## 8.3 The Grafana dashboard

Grafana is provisioned entirely from files, with data source and dashboard
JSON both created on first boot, so the dashboard is reproducible from the
repository rather than clicked together and lost with the container. It has
four rows: service-level indicators, request latency, throughput and errors,
and resource utilisation.

I took every screenshot **while a JMeter run was executing**, since panels on
an idle server show flat lines and prove nothing. Each run is captured in
three vertical sections rather than one tall image, so that every panel —
and the mean/max column beside each legend — stays readable at page size.

Figures 10 to 12 cover the **baseline** run and Figures 13 to 15 the
**optimised** run, both of the same dashboard over the two load-test windows.

![Figure 10 — Baseline run: service-level indicators and request latency. Error rate 0.00% at the cursor but climbing through the window; p95 peaks at 518.750 ms.](../monitoring/screenshots/grafana-baseline-1-indicators-latency.png)

![Figure 11 — Baseline run: throughput, error rate by status class, and resource utilisation. The error ratio reaches 19.779% and 4xx responses peak at 29.326 req/s.](../monitoring/screenshots/grafana-baseline-2-throughput-resources.png)

![Figure 12 — Baseline run: concurrency, event-loop lag and host memory.](../monitoring/screenshots/grafana-baseline-3-concurrency.png)

![Figure 13 — Optimised run: service-level indicators and request latency. The error-rate tile reads "No data", p95 sits at 88.094 ms.](../monitoring/screenshots/grafana-optimized-1-indicators-latency.png)

![Figure 14 — Optimised run: throughput, errors and resource utilisation. The error panel is empty; request rate peaks above 250 req/s and CPU reaches 63.7%.](../monitoring/screenshots/grafana-optimized-2-throughput-resources.png)

![Figure 15 — Optimised run: concurrency, event-loop lag and host memory.](../monitoring/screenshots/grafana-optimized-3-concurrency.png)

Read together these tell the story of §6 independently of JMeter. In Figure 11
the error-ratio series climbs to 19.779% and 4xx responses peak at 29.326
req/s, while CPU averages 22.3% user time. In Figure 14 the same panel is
simply empty, and the tile in Figure 13 reads "No data" — which is not a
broken panel but the correct rendering of a counter that was never
incremented, because not one 4xx or 5xx was recorded during the entire run.
Meanwhile request rate peaks above 250 req/s against roughly 180 before, and
CPU rises from a 22.3% mean to 27.1% with a 63.7% peak. The server works
harder and delivers more, which is the intended outcome.

Figures 12 and 15 support the saturation argument in §6.3. Event-loop lag in
the baseline sits on a raised plateau around 10 ms for the whole run, whereas
the optimised run holds a lower floor and spikes only under peak concurrency
— the signature of work being removed from the loop rather than merely
arriving later.

One deployment note. On macOS, Docker Desktop runs containers inside a Linux
VM, so node-exporter reports that VM rather than macOS itself. The
authoritative CPU and memory figures for Ledgr therefore come from
prom-client's process collectors, which measure the real Node process on the
host; node-exporter supplies surrounding machine-level context.

# 9. Conclusion and limitations

Establishing a baseline before changing anything was the most valuable part
of this assignment. The two features I chose were the right ones on the
merits, but the dominant problem lay in neither: an authentication round-trip
performed on every request by every route, which under 50 concurrent users
exhausted the auth server's database connections and failed roughly half of
all authenticated traffic. No amount of query tuning would have found that.
The shape of the error column in Table 3, with 0% on the two endpoints that
do not authenticate and around 50% on everything else, pointed straight at
it.

The four optimisations delivered a 52.5% reduction in average latency, 58.6%
at the 95th percentile, a 39.3% increase in throughput and the complete
elimination of a 22.41% error rate at moderate load, together with a 24.6%
reduction in the JavaScript a user downloads across a browsing session. Two
changes also fixed correctness bugs the performance work exposed rather than
caused: lifetime totals understated by 78% for any account past PostgREST's
row cap, and the reflected-input defect in the CSV export route.

Several limitations are worth stating. All measurements come from a single
machine over loopback, so network latency is absent and the client-side
bundle reduction matters more in reality than it appears here. The
application ran as one Node process, so throughput ceilings reflect that
rather than any architectural limit. The session cache is per-process, which
suits the current single-instance deployment but would need a shared
invalidation channel across instances. The 30-second session TTL is a
deliberate trade-off that would need revisiting for an application with
stricter revocation requirements.

Three things would be worth doing next: removing `unsafe-inline` from
`script-src` once Next.js applies nonces to its inline scripts; pushing the
analytics summary's bucketing into PostgreSQL as I did for the totals, which
would remove the last unbounded read; and re-running the comparison against a
multi-worker deployment to see which of these gains survive horizontal
scaling.

# 10. References

[1] Apache Software Foundation, "Apache JMeter User's Manual." [Online].
Available: https://jmeter.apache.org/usermanual/index.html

[2] OWASP Foundation, "ZAP Automation Framework." [Online]. Available:
https://www.zaproxy.org/docs/automate/automation-framework/

[3] Prometheus Authors, "Instrumentation Best Practices." [Online].
Available: https://prometheus.io/docs/practices/instrumentation/

[4] Grafana Labs, "Provision Grafana." [Online]. Available:
https://grafana.com/docs/grafana/latest/administration/provisioning/

[5] PostgREST Contributors, "Configuration: db-max-rows." [Online].
Available: https://docs.postgrest.org/en/stable/references/configuration.html

[6] Supabase Inc., "RLS Performance and Best Practices." [Online]. Available:
https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices

[7] Vercel Inc., "next.config.js: optimizePackageImports." [Online].
Available: https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports

[8] Vercel Inc., "Caching in Next.js: Client-side Router Cache." [Online].
Available: https://nextjs.org/docs/app/guides/caching

[9] PostgreSQL Global Development Group, "PostgreSQL 17 Documentation:
Indexes and ORDER BY." [Online]. Available:
https://www.postgresql.org/docs/17/indexes-ordering.html

[10] MITRE Corporation, "CWE-113: Improper Neutralization of CRLF Sequences
in HTTP Headers." [Online]. Available:
https://cwe.mitre.org/data/definitions/113.html

[11] W3C, "Content Security Policy Level 3." [Online]. Available:
https://www.w3.org/TR/CSP3/

[12] Vercel Inc., "Guides: Content Security Policy." [Online]. Available:
https://nextjs.org/docs/app/guides/content-security-policy

[13] S. Aro, "prom-client: Prometheus client for Node.js." [Online].
Available: https://github.com/siimon/prom-client

\newpage

# Appendix A — Repository and reproduction

**Repository:** <https://github.com/VijayPuttarevaiah/ledgr-web-assignment3>

All Assignment 3 material sits under `assignment3/`:

| Path | Contents |
|---|---|
| `jmeter/ledgr-test-plan.jmx` | The JMeter test plan, both scenarios |
| `jmeter/results/baseline/` | Baseline `.jtl`, per-scenario CSVs, statistics.json |
| `jmeter/results/optimized/` | Optimised `.jtl`, per-scenario CSVs, statistics.json |
| `zap/before/`, `zap/after/` | ZAP reports in HTML, JSON, Markdown and XML |
| `zap/run-scan.sh` | The authenticated headless scan |
| `monitoring/docker-compose.yml` | Prometheus, Grafana, node-exporter |
| `monitoring/prometheus/` | Scrape config and alert rules |
| `monitoring/grafana/` | Provisioned data source and dashboard JSON |
| `monitoring/screenshots/` | Dashboard and panel captures |
| `report/data/` | Summary CSVs, comparison CSVs, EXPLAIN output |
| `report/figures/` | Generated charts and report screenshots |
| `scripts/` | Seeding, session capture, measurement, analysis |

Application code changed by this work:

| Path | Change |
|---|---|
| `src/lib/cache/ttl-cache.ts` | TTL + LRU cache with request coalescing |
| `src/lib/api/session.ts` | Cached session verification |
| `src/lib/api/transaction-summary.ts` | Cached `transaction_totals()` aggregate |
| `src/lib/api/analytics-cache.ts` | Cached analytics summary |
| `src/lib/metrics.ts`, `src/lib/metrics-http-hook.ts` | Prometheus instrumentation |
| `src/instrumentation.ts`, `src/app/api/metrics/route.ts` | Registration and scrape endpoint |
| `src/lib/security/csp.ts` | Split document / non-document CSP |
| `src/components/charts/index.tsx` | Shared recharts chunk |
| `next.config.ts` | `optimizePackageImports`, `staleTimes`, scoped headers |
| `supabase/migrations/20260726000001_perf_aggregates.sql` | Composite index + aggregate function |
| `supabase/migrations/20260726000002_rls_initplan.sql` | 28 RLS policies rewritten |

To reproduce end to end:

```bash
supabase start
cd assignment3/monitoring && docker compose up -d && cd ../..

npm run seed:demo && npm run seed:loadtest
npm run build && PORT=3100 npm run start

npm run capture:session -- --base-url http://localhost:3100
./assignment3/scripts/run-jmeter.sh baseline
./assignment3/scripts/run-jmeter.sh optimized
python3 assignment3/scripts/analyse-results.py

npm run measure:client -- --label baseline
./assignment3/scripts/measure-db.sh
./assignment3/zap/run-scan.sh before
npm run capture:grafana && npm run capture:evidence
```
