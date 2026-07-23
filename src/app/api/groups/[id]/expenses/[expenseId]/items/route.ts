import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";

const itemSchema = z.object({
  item_name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().default(1),
  unit_price_cents: z.number().int().nonnegative(),
});

export async function POST(request: Request, context: { params: Promise<{ expenseId: string }> }) {
  try {
    const { expenseId } = await context.params;
    const { supabase } = await requireUser();
    const input = itemSchema.parse(await request.json());

    const { count } = await supabase
      .from("group_expense_items")
      .select("id", { count: "exact", head: true })
      .eq("group_expense_id", expenseId);

    const { data, error } = await supabase
      .from("group_expense_items")
      .insert({
        group_expense_id: expenseId,
        item_name: input.item_name,
        quantity: input.quantity,
        unit_price_cents: input.unit_price_cents,
        position: count ?? 0,
      })
      .select()
      .single();
    if (error) throw Errors.internal();

    return NextResponse.json({ item: { ...data, assigned_user_ids: [] } }, { status: 201 });
  } catch (error) {
    return jsonError(error, "POST /api/groups/[id]/expenses/[expenseId]/items");
  }
}
