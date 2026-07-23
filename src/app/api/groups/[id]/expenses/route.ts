import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { createGroupExpenseSchema } from "@/lib/validation/groups";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("group_expenses")
      .select("*, group_expense_shares(user_id, computed_share_cents)")
      .eq("group_id", id)
      .order("occurred_on", { ascending: false });
    if (error) throw Errors.internal();
    return NextResponse.json({ expenses: data });
  } catch (error) {
    return jsonError(error, "GET /api/groups/[id]/expenses");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await context.params;
    const { user, supabase } = await requireUser();
    const input = createGroupExpenseSchema.parse(await request.json());

    const { data: membership } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) throw Errors.forbidden("You need to be a member of this group to add an expense.");

    const { data: expense, error } = await supabase
      .from("group_expenses")
      .insert({
        group_id: groupId,
        description: input.description,
        total_amount_cents: input.total_amount_cents,
        paid_by: input.paid_by,
        occurred_on: input.occurred_on,
        split_mode: input.split_mode,
        tax_amount_cents: input.tax_amount_cents,
        tip_amount_cents: input.tip_amount_cents,
        tax_allocation: input.tax_allocation,
        tip_allocation: input.tip_allocation,
        discount_amount_cents: input.discount_amount_cents,
        receipt_image_path: input.receipt_image_path ?? null,
        status: "draft",
      })
      .select()
      .single();
    if (error) throw Errors.internal();

    if (input.split_mode === "equal" && input.participant_ids?.length) {
      await supabase
        .from("group_expense_shares")
        .insert(input.participant_ids.map((user_id) => ({ group_expense_id: expense.id, user_id })));
    } else if (input.split_mode === "exact" && input.exact_shares?.length) {
      await supabase.from("group_expense_shares").insert(
        input.exact_shares.map((s) => ({
          group_expense_id: expense.id,
          user_id: s.user_id,
          exact_amount_cents: s.exact_amount_cents,
        }))
      );
    } else if (input.split_mode === "weighted" && input.weighted_shares?.length) {
      await supabase.from("group_expense_shares").insert(
        input.weighted_shares.map((s) => ({
          group_expense_id: expense.id,
          user_id: s.user_id,
          weight: s.weight,
        }))
      );
    } else if (input.split_mode === "itemised" && input.items?.length) {
      for (const [index, item] of input.items.entries()) {
        const { data: itemRow, error: itemError } = await supabase
          .from("group_expense_items")
          .insert({
            group_expense_id: expense.id,
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price_cents: item.unit_price_cents,
            position: index,
          })
          .select("id")
          .single();
        if (itemError) throw Errors.internal();
        if (item.assigned_user_ids.length > 0) {
          await supabase
            .from("group_expense_item_assignments")
            .insert(item.assigned_user_ids.map((user_id) => ({ item_id: itemRow.id, user_id })));
        }
      }
    }

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return jsonError(error, "POST /api/groups/[id]/expenses");
  }
}
