import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { balancesForUser } from "@/lib/balances";

/** Shared by the Split Studio server page and the /api/groups/[id] route so the two can never disagree. */
export async function getGroupDetail(supabase: SupabaseClient<Database>, groupId: string, userId: string) {
  const { data: group } = await supabase.from("groups").select("*").eq("id", groupId).maybeSingle();
  if (!group) return null;

  // No direct FK between group_members and profiles (both independently
  // reference auth.users), so PostgREST can't embed profiles(...) here —
  // fetch and join in JS instead of relying on an embed that silently
  // returns nothing.
  const { data: memberRows } = await supabase.from("group_members").select("user_id, role, joined_at").eq("group_id", groupId);
  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: profileRows } = memberIds.length
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", memberIds)
    : { data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] };
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));
  const members = (memberRows ?? []).map((m) => ({ ...m, profile: profileById.get(m.user_id) ?? null }));

  const { data: expenses } = await supabase
    .from("group_expenses")
    .select("*")
    .eq("group_id", groupId)
    .order("occurred_on", { ascending: false });

  const expenseIds = (expenses ?? []).map((e) => e.id);
  const { data: shares } = expenseIds.length
    ? await supabase
        .from("group_expense_shares")
        .select("group_expense_id, user_id, computed_share_cents")
        .in("group_expense_id", expenseIds)
    : { data: [] as { group_expense_id: string; user_id: string; computed_share_cents: number | null }[] };

  const { data: settlements } = await supabase
    .from("settlements")
    .select("id, group_id, from_user_id, to_user_id, amount_cents, status, created_at, note")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const balances = balancesForUser(shares ?? [], expenses ?? [], settlements ?? [], userId).filter(
    (b) => b.groupId === groupId
  );

  const yourShareByExpense = new Map<string, number>();
  for (const s of shares ?? []) {
    if (s.user_id === userId) yourShareByExpense.set(s.group_expense_id, s.computed_share_cents ?? 0);
  }

  return {
    group,
    members: members.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      full_name: m.profile?.full_name ?? "Member",
    })),
    expenses: (expenses ?? []).map((e) => ({
      ...e,
      your_share_cents: yourShareByExpense.get(e.id) ?? null,
    })),
    settlements: settlements ?? [],
    balances,
  };
}

export type GroupDetail = NonNullable<Awaited<ReturnType<typeof getGroupDetail>>>;
