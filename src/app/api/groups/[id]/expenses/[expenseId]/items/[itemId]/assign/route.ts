import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";

const bodySchema = z.object({ user_id: z.uuid(), assigned: z.boolean() });

/** Direct-manipulation tap-to-assign (§7.5) — toggles one person on one line item. */
export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    const { itemId } = await context.params;
    const { supabase } = await requireUser();
    const { user_id, assigned } = bodySchema.parse(await request.json());

    if (assigned) {
      const { error } = await supabase.from("group_expense_item_assignments").upsert({ item_id: itemId, user_id });
      if (error) throw Errors.internal();
    } else {
      const { error } = await supabase
        .from("group_expense_item_assignments")
        .delete()
        .eq("item_id", itemId)
        .eq("user_id", user_id);
      if (error) throw Errors.internal();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, "POST /api/groups/[id]/expenses/[expenseId]/items/[itemId]/assign");
  }
}
