-- `insert ... returning` re-checks SELECT visibility on the new row, but at
-- the instant a group is created its owner's group_members row doesn't
-- exist yet (that's a separate follow-up insert) — so is_group_member()
-- fails and Postgres reports the whole statement as an RLS violation. A
-- creator should always be able to see their own group regardless of
-- membership-row timing, so allow that directly instead of only via
-- is_group_member().
drop policy groups_select_member on public.groups;

create policy groups_select_member on public.groups
  for select using (created_by = auth.uid() or public.is_group_member(id));
