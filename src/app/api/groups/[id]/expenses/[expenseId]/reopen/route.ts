import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";

/** §7.5 — reopen a confirmed split within its short window instead of treating confirmation as instantly final. */
export async function POST(_request: Request, context: { params: Promise<{ expenseId: string }> }) {
  try {
    const { expenseId } = await context.params;
    const { supabase } = await requireUser();

    const { data, error } = await supabase.rpc("reopen_group_expense", { p_expense_id: expenseId });
    if (error) {
      if (error.message.includes("reopen_window_expired")) {
        throw Errors.conflict("The 24-hour window to reopen this split has passed.");
      }
      if (error.message.includes("expense_not_confirmed")) throw Errors.conflict("This split isn't confirmed yet.");
      if (error.message.includes("not_a_group_member")) throw Errors.forbidden();
      throw Errors.internal();
    }

    return NextResponse.json({ expense: data });
  } catch (error) {
    return jsonError(error, "POST /api/groups/[id]/expenses/[expenseId]/reopen");
  }
}
