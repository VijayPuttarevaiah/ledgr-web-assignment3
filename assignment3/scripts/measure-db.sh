#!/usr/bin/env bash
#
# Assignment 3 §2 — evidence for server-side optimisation 2
# (database indexing + pushing aggregation into Postgres).
#
# Writes assignment3/report/data/db-optimisation-evidence.txt containing:
#
#   A. The HTTP round-trip the application actually pays: fetching every
#      transaction row through PostgREST to sum it in Node, versus calling
#      the transaction_totals() aggregate. This is where most of the win is,
#      and EXPLAIN cannot see it — it is serialisation and transfer cost,
#      not query cost. Part A also demonstrates that the old approach was
#      returning *wrong* totals, not merely slow ones.
#
#   B. What the new composite index does to the query plan for the ledger's
#      paginated read, at the first page and at a deep page.
#
#   C. An honest control: what the index does for the summary aggregate at
#      the demo dataset's distribution (where one account owns 99% of the
#      table) versus at the multi-tenant distribution a deployed instance
#      has. The multi-tenant case is reproduced inside a transaction that is
#      rolled back, so the dataset the JMeter runs measure is unchanged.
#
# Usage: ./assignment3/scripts/measure-db.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$REPO_ROOT/assignment3/report/data/db-optimisation-evidence.txt"
DB_CONTAINER="supabase_db_ledgr"
REST_URL="http://127.0.0.1:54321/rest/v1"
ATTEMPTS=8

ANON_KEY="$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$REPO_ROOT/.env.local" | cut -d= -f2-)"
USER_ID="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -tAc \
  "select id from auth.users where email='demo@ledgr.app'" | tr -d '[:space:]')"

# Both REST calls are made as the signed-in demo user, exactly as the
# application makes them. The anon key alone returns zero rows — row-level
# security doing its job — which would make the comparison meaningless.
ACCESS_TOKEN="$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"demo@ledgr.app","password":"DemoPass123!"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "error: could not sign in as demo@ledgr.app" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

{
  echo "Assignment 3 — server-side optimisation 2 evidence"
  echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%SZ')"
  echo "Load-test account: $USER_ID"
  echo
  echo "==========================================================================="
  echo "PART A — the round-trip the application pays (PostgREST over HTTP)"
  echo "==========================================================================="
  echo
  echo "--- BEFORE: fetch every transaction row and sum them in the application ---"
} > "$OUT"

for attempt in $(seq 1 $ATTEMPTS); do
  curl -s -o /tmp/ledgr-before.json \
    -w "  attempt $attempt: %{size_download} bytes, %{time_total} s\n" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
    "$REST_URL/transactions?user_id=eq.$USER_ID&select=type,amount_cents" >> "$OUT" || true
done

BEFORE_ROWS="$(python3 -c "import json;print(len(json.load(open('/tmp/ledgr-before.json'))))" 2>/dev/null || echo '?')"
BEFORE_SUM="$(python3 -c "
import json
rows = json.load(open('/tmp/ledgr-before.json'))
print(sum(r['amount_cents'] for r in rows if r['type']=='income'), sum(r['amount_cents'] for r in rows if r['type']=='expense'))
" 2>/dev/null || echo '? ?')"

{
  echo "  rows returned: $BEFORE_ROWS"
  echo "  income/expense totals computed from them (cents): $BEFORE_SUM"
  echo
  echo "--- AFTER: call transaction_totals(); Postgres computes the aggregate ---"
} >> "$OUT"

for attempt in $(seq 1 $ATTEMPTS); do
  curl -s -o /tmp/ledgr-after.json \
    -w "  attempt $attempt: %{size_download} bytes, %{time_total} s\n" \
    -X POST -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" -d '{}' \
    "$REST_URL/rpc/transaction_totals" >> "$OUT" || true
done

{
  echo "  response body: $(cat /tmp/ledgr-after.json)"
  echo
  echo "  NOTE: compare the two totals above. PostgREST enforces a server-side"
  echo "  row cap (db-max-rows, 1000 by default on a local Supabase stack), so"
  echo "  'fetch everything and add it up in Node' silently stops at the cap."
  echo "  For any account with more history than that, the summary the old code"
  echo "  displayed was not merely expensive to compute — it was wrong. The"
  echo "  aggregate always sees every row because it never leaves the database."
  echo
  echo "==========================================================================="
  echo "PART B — what the composite index does to the ledger's paginated read"
  echo "==========================================================================="
} >> "$OUT"

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres >> "$OUT" 2>&1 <<SQL
\pset pager off

\echo ''
\echo 'Indexes currently on public.transactions:'
select indexname from pg_indexes where tablename = 'transactions' order by indexname;

\echo ''
\echo '--- B1. AFTER: with transactions_user_ledger_idx (user_id, occurred_on desc, created_at desc) ---'
\echo 'page 1 (limit 20 offset 0):'
explain (analyze, buffers, costs off)
select * from public.transactions
where user_id = '$USER_ID'
order by occurred_on desc, created_at desc
limit 20 offset 0;

\echo ''
\echo 'page 101 (limit 20 offset 2000):'
explain (analyze, buffers, costs off)
select * from public.transactions
where user_id = '$USER_ID'
order by occurred_on desc, created_at desc
limit 20 offset 2000;

\echo ''
\echo '--- B2. BEFORE: same two queries with the new index dropped (rolled back) ---'
begin;
drop index public.transactions_user_ledger_idx;

\echo 'page 1 (limit 20 offset 0):'
explain (analyze, buffers, costs off)
select * from public.transactions
where user_id = '$USER_ID'
order by occurred_on desc, created_at desc
limit 20 offset 0;

\echo ''
\echo 'page 101 (limit 20 offset 2000):'
explain (analyze, buffers, costs off)
select * from public.transactions
where user_id = '$USER_ID'
order by occurred_on desc, created_at desc
limit 20 offset 2000;
rollback;

\echo ''
\echo '==========================================================================='
\echo 'PART C - control: the index and the summary aggregate'
\echo '==========================================================================='
\echo ''
\echo '--- C1. Demo dataset: one account owns 99% of the table ---'
select
  (select count(*) from public.transactions) as rows_total,
  (select count(*) from public.transactions where user_id = '$USER_ID') as rows_for_demo_user,
  (select count(distinct user_id) from public.transactions) as distinct_users;

\echo ''
\echo 'A sequential scan IS the right plan when a query needs 99% of the table.'
\echo 'The index changes nothing here, and this is reported rather than hidden:'
explain (analyze, buffers, costs off)
select
  coalesce(sum(amount_cents) filter (where type = 'income'), 0),
  coalesce(sum(amount_cents) filter (where type = 'expense'), 0),
  count(*)
from public.transactions
where user_id = '$USER_ID';

\echo ''
\echo '--- C2. Multi-tenant distribution, the shape a deployed instance has ---'
begin;

-- 200,000 rows spread across every account that already exists, so the
-- load-test account drops from 99% of the table to ~2%. Existing account
-- ids are reused rather than invented: transactions.user_id has a foreign
-- key to auth.users and fabricated UUIDs are rejected.
insert into public.transactions (user_id, type, amount_cents, description, occurred_on, is_recurring)
select
  owners.id,
  case when g % 12 = 0 then 'income' else 'expense' end,
  (500 + (g % 20000)),
  '[scale-test] synthetic row ' || g,
  current_date - ((g % 1080)),
  false
from generate_series(1, 200000) g
cross join lateral (
  select id from auth.users
  where email <> 'demo@ledgr.app'
  order by id
  offset (g % greatest((select count(*) - 1 from auth.users), 1))
  limit 1
) owners;

-- Without refreshing statistics the planner still believes the old
-- single-tenant distribution and keeps choosing the old plan.
analyze public.transactions;

select
  (select count(*) from public.transactions) as rows_total,
  (select count(*) from public.transactions where user_id = '$USER_ID') as rows_for_demo_user,
  (select count(distinct user_id) from public.transactions) as distinct_users;

\echo ''
\echo 'Aggregate at multi-tenant scale (selectivity now makes an index worthwhile):'
explain (analyze, buffers, costs off)
select
  coalesce(sum(amount_cents) filter (where type = 'income'), 0),
  coalesce(sum(amount_cents) filter (where type = 'expense'), 0),
  count(*)
from public.transactions
where user_id = '$USER_ID';

\echo ''
\echo 'Ledger page 101 at multi-tenant scale, with the index:'
explain (analyze, buffers, costs off)
select * from public.transactions
where user_id = '$USER_ID'
order by occurred_on desc, created_at desc
limit 20 offset 2000;

\echo ''
\echo 'and with it dropped:'
drop index public.transactions_user_ledger_idx;
explain (analyze, buffers, costs off)
select * from public.transactions
where user_id = '$USER_ID'
order by occurred_on desc, created_at desc
limit 20 offset 2000;

rollback;

\echo ''
\echo '--- C3. Dataset restored: no synthetic rows survive ---'
select count(*) as rows_total,
       count(*) filter (where description like '[scale-test]%') as synthetic_rows_remaining
from public.transactions;
SQL

echo "Wrote $OUT"
