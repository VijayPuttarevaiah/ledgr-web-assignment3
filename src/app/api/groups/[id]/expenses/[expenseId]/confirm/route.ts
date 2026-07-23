import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { computeSharesForExpense } from "@/lib/split-compute";
import type { Json } from "@/types/database";

/**
 * Locks in shares per §6.1/§6.2 and triggers the auto-flow core mechanic
 * (§1) — confirming immediately creates the personal-ledger transaction for
 * every participant via the confirm_group_expense RPC.
 */
export async function POST(_request: Request, context: { params: Promise<{ expenseId: string }> }) {
  try {
    const { expenseId } = await context.params;
    const { supabase } = await requireUser();

    const shares = await computeSharesForExpense(supabase, expenseId);

    const { data, error } = await supabase.rpc("confirm_group_expense", {
      p_expense_id: expenseId,
      p_shares: shares as unknown as Json,
    });
    if (error) {
      if (error.message.includes("not_a_group_member")) throw Errors.forbidden();
      if (error.message.includes("expense_not_found")) throw Errors.notFound("That expense");
      throw Errors.internal();
    }

    return NextResponse.json({ expense: data, shares });
  } catch (error) {
    return jsonError(error, "POST /api/groups/[id]/expenses/[expenseId]/confirm");
  }
}
