-- LEDGR Row Level Security (§5, §9 of LEDGR_BUILD_GUIDE.md)
-- Every table gets RLS enabled with no exceptions.

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers — avoid recursive-policy and repeated-subquery
-- footguns per the guide's mandated pattern.
-- ---------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid() and gm.role = 'owner'
  );
$$;

-- Membership check that goes through an expense/item id, for the child
-- tables that don't carry group_id directly.
create or replace function public.is_expense_group_member(p_group_expense_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_group_member(ge.group_id)
  from public.group_expenses ge
  where ge.id = p_group_expense_id;
$$;

create or replace function public.is_item_group_member(p_item_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_expense_group_member(gei.group_expense_id)
  from public.group_expense_items gei
  where gei.id = p_item_id;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- categories — system rows (user_id is null) are readable by everyone
-- authenticated; user rows are owned.
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;

create policy categories_select on public.categories
  for select using (user_id is null or user_id = auth.uid());
create policy categories_insert_own on public.categories
  for insert with check (user_id = auth.uid());
create policy categories_update_own on public.categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_delete_own on public.categories
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- transactions — strictly personal
-- ---------------------------------------------------------------------------
alter table public.transactions enable row level security;

create policy transactions_select_own on public.transactions
  for select using (user_id = auth.uid());
create policy transactions_insert_own on public.transactions
  for insert with check (user_id = auth.uid());
create policy transactions_update_own on public.transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_delete_own on public.transactions
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- recurring_rules — strictly personal
-- ---------------------------------------------------------------------------
alter table public.recurring_rules enable row level security;

create policy recurring_rules_select_own on public.recurring_rules
  for select using (user_id = auth.uid());
create policy recurring_rules_insert_own on public.recurring_rules
  for insert with check (user_id = auth.uid());
create policy recurring_rules_update_own on public.recurring_rules
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recurring_rules_delete_own on public.recurring_rules
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- budgets — strictly personal
-- ---------------------------------------------------------------------------
alter table public.budgets enable row level security;

create policy budgets_select_own on public.budgets
  for select using (user_id = auth.uid());
create policy budgets_insert_own on public.budgets
  for insert with check (user_id = auth.uid());
create policy budgets_update_own on public.budgets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy budgets_delete_own on public.budgets
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
alter table public.groups enable row level security;

create policy groups_select_member on public.groups
  for select using (public.is_group_member(id));
create policy groups_insert_authenticated on public.groups
  for insert with check (created_by = auth.uid());
create policy groups_update_owner on public.groups
  for update using (public.is_group_owner(id)) with check (public.is_group_owner(id));
create policy groups_delete_owner on public.groups
  for delete using (public.is_group_owner(id));

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------
alter table public.group_members enable row level security;

create policy group_members_select_member on public.group_members
  for select using (public.is_group_member(group_id));
-- Inserts happen via route handlers (group creation seeds the owner row,
-- invite acceptance seeds a member row) using the authenticated user's own
-- session; a user may only ever insert a membership row for themselves.
create policy group_members_insert_self on public.group_members
  for insert with check (user_id = auth.uid());
create policy group_members_delete_self_or_owner on public.group_members
  for delete using (user_id = auth.uid() or public.is_group_owner(group_id));

-- ---------------------------------------------------------------------------
-- group_invites
-- ---------------------------------------------------------------------------
alter table public.group_invites enable row level security;

create policy group_invites_select_member on public.group_invites
  for select using (public.is_group_member(group_id));
create policy group_invites_insert_member on public.group_invites
  for insert with check (public.is_group_member(group_id) and invited_by = auth.uid());
create policy group_invites_update_member on public.group_invites
  for update using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- group_expenses
-- ---------------------------------------------------------------------------
alter table public.group_expenses enable row level security;

create policy group_expenses_select_member on public.group_expenses
  for select using (public.is_group_member(group_id));
create policy group_expenses_insert_member on public.group_expenses
  for insert with check (public.is_group_member(group_id) and paid_by = auth.uid());
create policy group_expenses_update_member on public.group_expenses
  for update using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy group_expenses_delete_member on public.group_expenses
  for delete using (public.is_group_member(group_id) and status = 'draft');

-- ---------------------------------------------------------------------------
-- group_expense_items
-- ---------------------------------------------------------------------------
alter table public.group_expense_items enable row level security;

create policy group_expense_items_select_member on public.group_expense_items
  for select using (public.is_expense_group_member(group_expense_id));
create policy group_expense_items_insert_member on public.group_expense_items
  for insert with check (public.is_expense_group_member(group_expense_id));
create policy group_expense_items_update_member on public.group_expense_items
  for update using (public.is_expense_group_member(group_expense_id));
create policy group_expense_items_delete_member on public.group_expense_items
  for delete using (public.is_expense_group_member(group_expense_id));

-- ---------------------------------------------------------------------------
-- group_expense_item_assignments
-- ---------------------------------------------------------------------------
alter table public.group_expense_item_assignments enable row level security;

create policy group_expense_item_assignments_select_member on public.group_expense_item_assignments
  for select using (public.is_item_group_member(item_id));
create policy group_expense_item_assignments_insert_member on public.group_expense_item_assignments
  for insert with check (public.is_item_group_member(item_id));
create policy group_expense_item_assignments_delete_member on public.group_expense_item_assignments
  for delete using (public.is_item_group_member(item_id));

-- ---------------------------------------------------------------------------
-- group_expense_shares
-- ---------------------------------------------------------------------------
alter table public.group_expense_shares enable row level security;

create policy group_expense_shares_select_member on public.group_expense_shares
  for select using (public.is_expense_group_member(group_expense_id));
create policy group_expense_shares_insert_member on public.group_expense_shares
  for insert with check (public.is_expense_group_member(group_expense_id));
create policy group_expense_shares_update_member on public.group_expense_shares
  for update using (public.is_expense_group_member(group_expense_id));
create policy group_expense_shares_delete_member on public.group_expense_shares
  for delete using (public.is_expense_group_member(group_expense_id));

-- ---------------------------------------------------------------------------
-- settlements
-- ---------------------------------------------------------------------------
alter table public.settlements enable row level security;

create policy settlements_select_member on public.settlements
  for select using (public.is_group_member(group_id));
create policy settlements_insert_member on public.settlements
  for insert with check (public.is_group_member(group_id) and from_user_id = auth.uid());
create policy settlements_update_member on public.settlements
  for update using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- ai_usage_log — users read their own rows; all writes are server-side via
-- the service-role key (route handlers), never from client code.
-- ---------------------------------------------------------------------------
alter table public.ai_usage_log enable row level security;

create policy ai_usage_log_select_own on public.ai_usage_log
  for select using (user_id = auth.uid());
-- Deliberately no insert/update/delete policy for anon/authenticated roles:
-- writes only happen through the service-role key, which bypasses RLS.
