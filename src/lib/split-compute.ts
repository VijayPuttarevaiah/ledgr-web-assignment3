import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  splitEqual,
  splitWeighted,
  splitItemised,
  allocateTaxTipDiscount,
  validateExactSplit,
  sumShares,
  type WeightedParticipant,
  type LineItemInput,
} from "@/lib/split-math";
import { Errors } from "@/lib/api/errors";

export interface ComputedShare {
  user_id: string;
  weight: number | null;
  exact_amount_cents: number | null;
  computed_share_cents: number;
}

/**
 * Bridges the draft rows stored at expense-creation time to the pure §6.1/
 * §6.2 math in split-math.ts, then to the shape confirm_group_expense's RPC
 * expects. This is the only place that math runs against real data — the
 * math itself stays pure and unit-tested.
 */
export async function computeSharesForExpense(
  supabase: SupabaseClient<Database>,
  expenseId: string
): Promise<ComputedShare[]> {
  const { data: expense, error: expenseError } = await supabase
    .from("group_expenses")
    .select("*")
    .eq("id", expenseId)
    .single();
  if (expenseError || !expense) throw Errors.notFound("That expense");

  if (expense.split_mode === "equal") {
    const { data: draftShares } = await supabase
      .from("group_expense_shares")
      .select("user_id")
      .eq("group_expense_id", expenseId);
    const participantIds = (draftShares ?? []).map((s) => s.user_id);
    if (participantIds.length === 0) throw Errors.badRequest("Add at least one participant before confirming.");
    const shares = splitEqual(expense.total_amount_cents, participantIds, expense.paid_by);
    return Object.entries(shares).map(([user_id, cents]) => ({
      user_id,
      weight: null,
      exact_amount_cents: null,
      computed_share_cents: cents,
    }));
  }

  if (expense.split_mode === "exact") {
    const { data: draftShares } = await supabase
      .from("group_expense_shares")
      .select("user_id, exact_amount_cents")
      .eq("group_expense_id", expenseId);
    const amounts: Record<string, number> = {};
    for (const s of draftShares ?? []) amounts[s.user_id] = s.exact_amount_cents ?? 0;
    const { valid, sum } = validateExactSplit(expense.total_amount_cents, amounts);
    if (!valid) {
      throw Errors.badRequest(
        `Exact amounts add up to $${(sum / 100).toFixed(2)}, but the total is $${(expense.total_amount_cents / 100).toFixed(2)}. Adjust the amounts so they match exactly.`
      );
    }
    return Object.entries(amounts).map(([user_id, cents]) => ({
      user_id,
      weight: null,
      exact_amount_cents: cents,
      computed_share_cents: cents,
    }));
  }

  if (expense.split_mode === "weighted") {
    const { data: draftShares } = await supabase
      .from("group_expense_shares")
      .select("user_id, weight")
      .eq("group_expense_id", expenseId);
    const participants: WeightedParticipant[] = (draftShares ?? []).map((s) => ({
      userId: s.user_id,
      weight: Number(s.weight ?? 0),
    }));
    if (participants.length === 0) throw Errors.badRequest("Add at least one participant before confirming.");
    const shares = splitWeighted(expense.total_amount_cents, participants, expense.paid_by);
    return Object.entries(shares).map(([user_id, cents]) => {
      const p = participants.find((x) => x.userId === user_id);
      return { user_id, weight: p?.weight ?? null, exact_amount_cents: null, computed_share_cents: cents };
    });
  }

  // itemised
  const { data: items } = await supabase
    .from("group_expense_items")
    .select("id, item_name, quantity, unit_price_cents, group_expense_item_assignments(user_id)")
    .eq("group_expense_id", expenseId);
  if (!items || items.length === 0) throw Errors.badRequest("Add at least one line item before confirming.");

  const lineItems: LineItemInput[] = items.map((it) => ({
    id: it.id,
    lineTotalCents: Math.round(Number(it.quantity) * it.unit_price_cents),
    assignedUserIds: (it.group_expense_item_assignments as unknown as { user_id: string }[]).map((a) => a.user_id),
  }));
  const unassigned = lineItems.filter((li) => li.assignedUserIds.length === 0);
  if (unassigned.length > 0) {
    throw Errors.badRequest("Every item needs at least one person assigned to it before confirming.");
  }

  const itemSubtotalsByUser = splitItemised(lineItems);
  const billSubtotalCents = lineItems.reduce((a, li) => a + li.lineTotalCents, 0);

  const finalShares = allocateTaxTipDiscount({
    itemSubtotalsByUser,
    billSubtotalCents,
    discountAmountCents: expense.discount_amount_cents,
    taxAmountCents: expense.tax_amount_cents,
    taxAllocation: expense.tax_allocation as "proportional" | "equal",
    tipAmountCents: expense.tip_amount_cents,
    tipAllocation: expense.tip_allocation as "proportional" | "equal",
    totalAmountCents: expense.total_amount_cents,
    paidBy: expense.paid_by,
  });

  const result = Object.entries(finalShares).map(([user_id, cents]) => ({
    user_id,
    weight: null,
    exact_amount_cents: null,
    computed_share_cents: cents,
  }));

  // Defense in depth: the RPC re-validates this same invariant server-side
  // before writing anything, but failing fast here gives a clearer error.
  if (sumShares(finalShares) !== expense.total_amount_cents) {
    throw Errors.internal("The split math didn't reconcile to the total. Try recalculating.");
  }

  return result;
}
