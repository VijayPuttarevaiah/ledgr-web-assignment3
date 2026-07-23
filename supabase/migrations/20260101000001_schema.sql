-- LEDGR core schema (§5 of LEDGR_BUILD_GUIDE.md)
-- All monetary values are integer cents. Never floating point.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: mirrors auth.users, one row per user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  default_currency text not null default 'CAD',
  date_format text not null default 'MMM D, YYYY',
  default_payment_method text not null default 'Debit Card',
  notify_email_digest boolean not null default true,
  notify_push boolean not null default false,
  notify_settlement_reminders boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per authenticated user, created automatically on sign-up.';

-- ---------------------------------------------------------------------------
-- categories: system defaults (user_id null) + per-user custom categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  color text not null,
  icon text not null default 'Tag',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  constraint categories_name_not_blank check (btrim(name) <> '')
);

create unique index categories_system_name_uidx
  on public.categories (name) where (user_id is null);
create unique index categories_user_name_uidx
  on public.categories (user_id, name) where (user_id is not null);

-- ---------------------------------------------------------------------------
-- recurring_rules
-- ---------------------------------------------------------------------------
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount_cents integer not null check (amount_cents >= 0),
  description text not null,
  category_id uuid references public.categories (id) on delete set null,
  payment_method text,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  next_run_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index recurring_rules_due_idx
  on public.recurring_rules (next_run_on) where (active = true);

-- ---------------------------------------------------------------------------
-- groups / group_members / group_invites
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users (id),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index group_invites_group_idx on public.group_invites (group_id);
create index group_invites_email_idx on public.group_invites (lower(email));

-- ---------------------------------------------------------------------------
-- group_expenses and children
-- ---------------------------------------------------------------------------
create table public.group_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null,
  total_amount_cents integer not null check (total_amount_cents > 0),
  paid_by uuid not null references auth.users (id),
  occurred_on date not null default current_date,
  split_mode text not null check (split_mode in ('equal', 'itemised', 'exact', 'weighted')),
  tax_amount_cents integer not null default 0 check (tax_amount_cents >= 0),
  tip_amount_cents integer not null default 0 check (tip_amount_cents >= 0),
  tax_allocation text not null default 'proportional' check (tax_allocation in ('proportional', 'equal')),
  tip_allocation text not null default 'proportional' check (tip_allocation in ('proportional', 'equal')),
  discount_amount_cents integer not null default 0 check (discount_amount_cents >= 0),
  receipt_image_path text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  confirmed_at timestamptz,
  reopened_until timestamptz,
  created_at timestamptz not null default now()
);

create index group_expenses_group_idx on public.group_expenses (group_id, occurred_on desc);

create table public.group_expense_items (
  id uuid primary key default gen_random_uuid(),
  group_expense_id uuid not null references public.group_expenses (id) on delete cascade,
  item_name text not null,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  position integer not null default 0
);

create index group_expense_items_expense_idx on public.group_expense_items (group_expense_id);

create table public.group_expense_item_assignments (
  item_id uuid not null references public.group_expense_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (item_id, user_id)
);

create table public.group_expense_shares (
  id uuid primary key default gen_random_uuid(),
  group_expense_id uuid not null references public.group_expenses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  weight numeric(10, 4),
  exact_amount_cents integer,
  computed_share_cents integer,
  unique (group_expense_id, user_id)
);

create index group_expense_shares_expense_idx on public.group_expense_shares (group_expense_id);
create index group_expense_shares_user_idx on public.group_expense_shares (user_id);

-- ---------------------------------------------------------------------------
-- settlements
-- ---------------------------------------------------------------------------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user_id uuid not null references auth.users (id),
  to_user_id uuid not null references auth.users (id),
  amount_cents integer not null check (amount_cents > 0),
  related_expense_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'settled')),
  settled_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index settlements_group_idx on public.settlements (group_id);

-- ---------------------------------------------------------------------------
-- transactions (the personal ledger)
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount_cents integer not null check (amount_cents >= 0),
  description text not null,
  category_id uuid references public.categories (id) on delete set null,
  payment_method text,
  occurred_on date not null default current_date,
  is_recurring boolean not null default false,
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  source_group_expense_id uuid references public.group_expenses (id) on delete set null,
  receipt_image_path text,
  ai_category_confidence numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_user_category_idx on public.transactions (user_id, category_id);
create index transactions_source_expense_idx on public.transactions (source_group_expense_id);
-- Idempotency guard for the recurring-transaction cron (§6.5): one generated
-- transaction per rule per calendar day, enforced at the database layer.
create unique index transactions_recurring_once_per_day_uidx
  on public.transactions (recurring_rule_id, occurred_on)
  where (recurring_rule_id is not null);

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null,
  base_amount_cents integer not null check (base_amount_cents >= 0),
  rollover_amount_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month),
  constraint budgets_month_is_first_of_month check (date_trunc('month', month) = month)
);

create index budgets_user_month_idx on public.budgets (user_id, month);

-- ---------------------------------------------------------------------------
-- ai_usage_log
-- ---------------------------------------------------------------------------
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('categorization', 'ocr', 'narrative')),
  model text,
  estimated_cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index ai_usage_log_month_idx on public.ai_usage_log (created_at);
create index ai_usage_log_user_idx on public.ai_usage_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- auto-create a profile row whenever a new auth user is created
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
