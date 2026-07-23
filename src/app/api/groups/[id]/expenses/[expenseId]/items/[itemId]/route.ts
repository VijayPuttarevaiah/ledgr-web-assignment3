import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";

export async function DELETE(_request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    const { itemId } = await context.params;
    const { supabase } = await requireUser();
    const { error, count } = await supabase.from("group_expense_items").delete({ count: "exact" }).eq("id", itemId);
    if (error) throw Errors.internal();
    if (!count) throw Errors.notFound("That item");
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, "DELETE /api/groups/[id]/expenses/[expenseId]/items/[itemId]");
  }
}
