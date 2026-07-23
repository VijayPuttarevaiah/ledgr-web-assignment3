import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { allocationModeSchema } from "@/lib/validation/groups";

export async function GET(_request: Request, context: { params: Promise<{ expenseId: string }> }) {
  try {
    const { expenseId } = await context.params;
    const { supabase } = await requireUser();

    const { data: expense, error } = await supabase.from("group_expenses").select("*").eq("id", expenseId).maybeSingle();
    if (error) throw Errors.internal();
    if (!expense) throw Errors.notFound("That expense");

    const { data: items } = await supabase
      .from("group_expense_items")
      .select("*, group_expense_item_assignments(user_id)")
      .eq("group_expense_id", expenseId)
      .order("position");

    const { data: shares } = await supabase
      .from("group_expense_shares")
      .select("user_id, computed_share_cents, weight, exact_amount_cents")
      .eq("group_expense_id", expenseId);

    return NextResponse.json({
      expense,
      items: (items ?? []).map((it) => ({
        ...it,
        assigned_user_ids: (it.group_expense_item_assignments as unknown as { user_id: string }[]).map((a) => a.user_id),
      })),
      shares: shares ?? [],
    });
  } catch (error) {
    return jsonError(error, "GET /api/groups/[id]/expenses/[expenseId]");
  }
}

const patchSchema = z.object({
  description: z.string().trim().min(1).max(200).optional(),
  total_amount_cents: z.number().int().positive().optional(),
  tax_amount_cents: z.number().int().nonnegative().optional(),
  tip_amount_cents: z.number().int().nonnegative().optional(),
  tax_allocation: allocationModeSchema.optional(),
  tip_allocation: allocationModeSchema.optional(),
  discount_amount_cents: z.number().int().nonnegative().optional(),
  receipt_image_path: z.string().max(500).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ expenseId: string }> }) {
  try {
    const { expenseId } = await context.params;
    const { supabase } = await requireUser();
    const input = patchSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("group_expenses")
      .update(input)
      .eq("id", expenseId)
      .eq("status", "draft")
      .select()
      .maybeSingle();
    if (error) throw Errors.internal();
    if (!data) throw Errors.conflict("This expense is already confirmed — reopen it first to make changes.");

    return NextResponse.json({ expense: data });
  } catch (error) {
    return jsonError(error, "PATCH /api/groups/[id]/expenses/[expenseId]");
  }
}
