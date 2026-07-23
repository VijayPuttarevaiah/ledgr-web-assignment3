-- Real bug found via realistic multi-user demo data: `profiles_select_own`
-- only lets a user see their *own* profile row, so every other Split
-- Studio member's name/avatar silently resolved to nothing (PostgREST
-- filters RLS-denied rows out rather than erroring, so this failed quietly
-- — every fellow group member rendered as the generic "Member" fallback).
-- A user should be able to see the profile of anyone they share at least
-- one group with — that's the actual privacy boundary for a shared-expense
-- app, not "nobody but yourself."
create policy profiles_select_shared_group on public.profiles
  for select using (
    exists (
      select 1
      from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = profiles.id and gm2.user_id = auth.uid()
    )
  );
