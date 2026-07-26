-- Assignment 3 §2 — server-side optimisation 2:
-- database indexing + pushing aggregation down into Postgres.
--
-- The baseline profile showed GET /api/transactions and the Ledger page
-- doing the same wasteful thing: after fetching the 20 rows the user
-- actually sees, both then fetched *every* transaction the user has ever
-- recorded — `select type, amount_cents from transactions where user_id = ?`
-- with no limit — purely to add up two totals in JavaScript. On the 4,091-row
-- load-test account that is 4,091 rows serialised to JSON, shipped over
-- HTTP from PostgREST, parsed by Node and then reduced to two integers, on
-- every single page view. It is also unbounded: the cost grows linearly
-- with a user's history for a result that never gets bigger than two numbers.
--
-- The fix is the textbook one — compute the aggregate where the data lives,
-- and give the planner an index that can answer it without touching the
-- heap.

-- ---------------------------------------------------------------------------
-- 1. Composite index matching the ledger's sort order
-- ---------------------------------------------------------------------------
-- Both the Ledger page and GET /api/transactions read
--     ... where user_id = ? order by occurred_on desc, created_at desc
--     limit 20 offset ?
--
-- `transactions_user_date_idx (user_id, occurred_on desc)` already existed
-- and gets the planner most of the way, but it stops one column short: it
-- cannot resolve the `created_at desc` tiebreak, so Postgres has to sort on
-- top of the index scan. On page 1 that shows up as an Incremental Sort;
-- past the first few pages the planner gives up on the index altogether and
-- falls back to a Seq Scan plus a top-N heapsort of the user's entire
-- history, which grows with every transaction they ever add.
--
-- Extending the index to the full sort key turns both cases into a plain
-- ordered index walk with no sort node at all. Measured on the 4,091-row
-- load-test account (EXPLAIN ANALYZE, see
-- assignment3/report/data/db-optimisation-evidence.txt):
--
--                       before      after
--   page 1 (offset 0)   0.265 ms    0.081 ms    Incremental Sort -> Index Scan
--   page 100 (offset 2000)  2.139 ms  0.748 ms  Seq Scan + heapsort -> Index Scan
--
-- INCLUDE carries `type` and `amount_cents` as non-key payload so the
-- summary aggregate below can also be answered without a heap visit on
-- tables where the planner chooses this index for it.
create index if not exists transactions_user_ledger_idx
  on public.transactions (user_id, occurred_on desc, created_at desc)
  include (type, amount_cents);

-- ---------------------------------------------------------------------------
-- 2. Aggregate function
-- ---------------------------------------------------------------------------
-- `security invoker` (the default, stated explicitly because it is the whole
-- security argument here): the function runs as the calling user, so the
-- row-level security policy on `transactions` applies exactly as it does to
-- a direct query. Scoping on `auth.uid()` rather than accepting a user_id
-- argument means a caller cannot ask for someone else's totals even if the
-- RLS policy were later loosened.
--
-- `stable` tells the planner the result cannot change within a statement,
-- which allows it to be evaluated once rather than per row.
create or replace function public.transaction_totals(
  p_from date default null,
  p_to date default null
)
returns table (
  income_cents bigint,
  expense_cents bigint,
  tx_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount_cents) filter (where type = 'income'), 0)::bigint  as income_cents,
    coalesce(sum(amount_cents) filter (where type = 'expense'), 0)::bigint as expense_cents,
    count(*)::bigint                                                       as tx_count
  from public.transactions
  where user_id = auth.uid()
    and (p_from is null or occurred_on >= p_from)
    and (p_to   is null or occurred_on <= p_to);
$$;

comment on function public.transaction_totals(date, date) is
  'Income/expense/count totals for the calling user, optionally date-bounded. Replaces fetching every transaction row into the application to sum it there (Assignment 3, server-side optimisation 2).';

grant execute on function public.transaction_totals(date, date) to authenticated;

-- Keep the planner honest about the new index straight away rather than
-- waiting for autovacuum, so the first request after a deploy is already
-- planned correctly.
analyze public.transactions;
