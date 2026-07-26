-- Assignment 3 §2 — server-side optimisation 2 (b):
-- stop re-evaluating auth.uid() once per row in every RLS policy.
--
-- Supabase's `auth.uid()` is not a constant. It expands to
--
--   COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''),
--            (NULLIF(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'sub')::uuid
--
-- — two GUC lookups, a JSONB parse and a cast. Written bare inside a policy
-- predicate, Postgres treats it as a per-row filter expression and runs all
-- of that for every candidate row it examines. On the 4,091-row load-test
-- account that is 4,091 JSONB parses to answer a query whose answer depends
-- on the session, not on the row.
--
-- Wrapping it in a scalar subquery makes the planner hoist it into an
-- InitPlan: evaluated exactly once per statement, then compared as a plain
-- UUID constant. That also makes the predicate index-compatible, because
-- `user_id = <constant>` can drive an index scan while
-- `user_id = <volatile expression>` cannot.
--
-- Measured with EXPLAIN (ANALYZE, BUFFERS) as role `authenticated` with a
-- real JWT claim set, on the 4,091-row account
-- (assignment3/report/data/db-optimisation-evidence.txt):
--
--                                    before      after      change
--   select count(*) from transactions  3.090 ms   0.442 ms   7.0x faster
--     plan                             Seq Scan   Index Only Scan
--     shared buffers hit               76         8          -89%
--   ledger page 101 (offset 2000)      3.733 ms   1.652 ms   2.3x faster
--
-- This is a rewrite of the *predicate*, not of the *rule*: each policy still
-- admits exactly the same rows for exactly the same users. The security
-- posture is unchanged, which is why it is safe to apply across every
-- policy at once rather than only the ones on the hot path.
--
-- Generated from pg_policies so no policy is missed; see
-- assignment3/scripts/measure-db.sh for the measurement harness.

alter policy ai_usage_log_select_own on public.ai_usage_log using ((user_id = (select auth.uid())));
alter policy budgets_delete_own on public.budgets using ((user_id = (select auth.uid())));
alter policy budgets_insert_own on public.budgets with check ((user_id = (select auth.uid())));
alter policy budgets_select_own on public.budgets using ((user_id = (select auth.uid())));
alter policy budgets_update_own on public.budgets using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy categories_delete_own on public.categories using ((user_id = (select auth.uid())));
alter policy categories_insert_own on public.categories with check ((user_id = (select auth.uid())));
alter policy categories_select on public.categories using (((user_id IS NULL) OR (user_id = (select auth.uid()))));
alter policy categories_update_own on public.categories using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy group_expenses_insert_member on public.group_expenses with check ((is_group_member(group_id) AND (paid_by = (select auth.uid()))));
alter policy group_invites_insert_member on public.group_invites with check ((is_group_member(group_id) AND (invited_by = (select auth.uid()))));
alter policy group_members_delete_self_or_owner on public.group_members using (((user_id = (select auth.uid())) OR is_group_owner(group_id)));
alter policy group_members_insert_self on public.group_members with check ((user_id = (select auth.uid())));
alter policy groups_insert_authenticated on public.groups with check ((created_by = (select auth.uid())));
alter policy groups_select_member on public.groups using (((created_by = (select auth.uid())) OR is_group_member(id)));
alter policy profiles_insert_own on public.profiles with check ((id = (select auth.uid())));
alter policy profiles_select_own on public.profiles using ((id = (select auth.uid())));
alter policy profiles_select_shared_group on public.profiles using ((EXISTS ( SELECT 1
FROM (group_members gm1
JOIN group_members gm2 ON ((gm1.group_id = gm2.group_id)))
WHERE ((gm1.user_id = profiles.id) AND (gm2.user_id = (select auth.uid()))))));
alter policy profiles_update_own on public.profiles using ((id = (select auth.uid()))) with check ((id = (select auth.uid())));
alter policy recurring_rules_delete_own on public.recurring_rules using ((user_id = (select auth.uid())));
alter policy recurring_rules_insert_own on public.recurring_rules with check ((user_id = (select auth.uid())));
alter policy recurring_rules_select_own on public.recurring_rules using ((user_id = (select auth.uid())));
alter policy recurring_rules_update_own on public.recurring_rules using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy settlements_insert_member on public.settlements with check ((is_group_member(group_id) AND (from_user_id = (select auth.uid()))));
alter policy transactions_delete_own on public.transactions using ((user_id = (select auth.uid())));
alter policy transactions_insert_own on public.transactions with check ((user_id = (select auth.uid())));
alter policy transactions_select_own on public.transactions using ((user_id = (select auth.uid())));
alter policy transactions_update_own on public.transactions using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));

-- Re-plan against the rewritten predicates immediately.
analyze public.transactions;
analyze public.categories;
analyze public.budgets;
analyze public.profiles;
