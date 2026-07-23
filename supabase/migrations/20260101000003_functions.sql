-- LEDGR RPCs that need SECURITY DEFINER privilege because they legitimately
-- write on behalf of more than one user (the "auto-flow" core mechanic,
-- §1/§6 of LEDGR_BUILD_GUIDE.md) or need to bridge a not-yet-a-member gap
-- (invite acceptance). Every function re-validates authorization internally
-- via auth.uid() — it is never trusted purely because it's callable.
--
-- The split-math itself (§6.1/§6.2) is computed and unit-tested in
-- TypeScript (src/lib/split-math.ts); these functions only persist an
-- already-computed, already-validated result atomically. The function
-- re-checks the invariant (shares sum to total) as defense in depth before
-- writing anything, so a compromised or buggy client can never desync the
-- ledger even if it sends bad numbers.

-- ---------------------------------------------------------------------------
-- confirm_group_expense — locks in shares, (re)generates the auto-flowed
-- personal-ledger transaction for every participant, atomically.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_group_expense(
  p_expense_id uuid,
  p_shares jsonb -- [{ "user_id": uuid, "weight": number|null, "exact_amount_cents": int|null, "computed_share_cents": int }]
)
returns public.group_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expense public.group_expenses;
  v_share_sum bigint;
  v_share jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_expense from public.group_expenses where id = p_expense_id for update;
  if not found then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  if not public.is_group_member(v_expense.group_id) then
    raise exception 'not_a_group_member' using errcode = '42501';
  end if;

  select coalesce(sum((s ->> 'computed_share_cents')::bigint), 0)
    into v_share_sum
    from jsonb_array_elements(p_shares) as s;

  if v_share_sum <> v_expense.total_amount_cents then
    raise exception 'shares_do_not_reconcile: sum=% total=%', v_share_sum, v_expense.total_amount_cents
      using errcode = '22000';
  end if;

  -- Wipe any prior confirmation state (covers the reopen -> edit -> reconfirm loop)
  delete from public.group_expense_shares where group_expense_id = p_expense_id;
  delete from public.transactions where source_group_expense_id = p_expense_id;

  for v_share in select * from jsonb_array_elements(p_shares)
  loop
    insert into public.group_expense_shares (
      group_expense_id, user_id, weight, exact_amount_cents, computed_share_cents
    ) values (
      p_expense_id,
      (v_share ->> 'user_id')::uuid,
      nullif(v_share ->> 'weight', '')::numeric,
      nullif(v_share ->> 'exact_amount_cents', '')::integer,
      (v_share ->> 'computed_share_cents')::integer
    );

    if (v_share ->> 'computed_share_cents')::integer > 0 then
      insert into public.transactions (
        user_id, type, amount_cents, description, occurred_on, source_group_expense_id, payment_method
      ) values (
        (v_share ->> 'user_id')::uuid,
        'expense',
        (v_share ->> 'computed_share_cents')::integer,
        'Split: ' || v_expense.description,
        v_expense.occurred_on,
        p_expense_id,
        'Paid via split'
      );
    end if;
  end loop;

  update public.group_expenses
    set status = 'confirmed', confirmed_at = now(), reopened_until = now() + interval '24 hours'
    where id = p_expense_id
    returning * into v_expense;

  return v_expense;
end;
$$;

grant execute on function public.confirm_group_expense(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- reopen_group_expense — short reopen window per §7.5.
-- ---------------------------------------------------------------------------
create or replace function public.reopen_group_expense(p_expense_id uuid)
returns public.group_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.group_expenses;
begin
  select * into v_expense from public.group_expenses where id = p_expense_id for update;
  if not found then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  if not public.is_group_member(v_expense.group_id) then
    raise exception 'not_a_group_member' using errcode = '42501';
  end if;

  if v_expense.status <> 'confirmed' then
    raise exception 'expense_not_confirmed' using errcode = '22000';
  end if;

  if v_expense.reopened_until is null or now() > v_expense.reopened_until then
    raise exception 'reopen_window_expired' using errcode = '22000';
  end if;

  update public.group_expenses set status = 'draft'
    where id = p_expense_id
    returning * into v_expense;

  return v_expense;
end;
$$;

grant execute on function public.reopen_group_expense(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_group_invite — bridges the not-a-member-yet gap: the invitee can't
-- satisfy group_invites' member-only update policy until they're a member,
-- so this one step must run with elevated privilege, re-validating the
-- token itself as the authorization proof.
-- ---------------------------------------------------------------------------
create or replace function public.accept_group_invite(p_token text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.group_invites;
  v_group public.groups;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.group_invites where token = p_token for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  if v_invite.status = 'accepted' then
    raise exception 'invite_already_used' using errcode = '22000';
  end if;

  if v_invite.status = 'expired' or now() > v_invite.expires_at then
    update public.group_invites set status = 'expired' where id = v_invite.id;
    raise exception 'invite_expired' using errcode = '22000';
  end if;

  insert into public.group_members (group_id, user_id, role)
    values (v_invite.group_id, v_uid, 'member')
    on conflict (group_id, user_id) do nothing;

  update public.group_invites set status = 'accepted' where id = v_invite.id;

  select * into v_group from public.groups where id = v_invite.group_id;
  return v_group;
end;
$$;

grant execute on function public.accept_group_invite(text) to authenticated;
