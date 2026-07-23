-- A visitor holding an invite token isn't a group member yet, so the normal
-- group_invites RLS policy (member-only select) correctly blocks them. This
-- narrow, read-only function lets the accept screen show "You've been
-- invited to Apartment 4B by Vijay" before the user is a member — token
-- possession is the authorization, exactly as for accept_group_invite.
create or replace function public.get_invite_preview(p_token text)
returns table (
  group_name text,
  invited_by_name text,
  email text,
  status text,
  expires_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    g.name,
    coalesce(p.full_name, 'A group owner'),
    gi.email,
    case when gi.status = 'pending' and gi.expires_at < now() then 'expired' else gi.status end,
    gi.expires_at
  from public.group_invites gi
  join public.groups g on g.id = gi.group_id
  left join public.profiles p on p.id = gi.invited_by
  where gi.token = p_token;
$$;

grant execute on function public.get_invite_preview(text) to authenticated, anon;
