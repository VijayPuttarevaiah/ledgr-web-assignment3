import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { updateTransactionSchema } from "@/lib/validation/transactions";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const body = await request.json();
    const input = updateTransactionSchema.parse(body);

    const patch: Record<string, unknown> = {};
    if (input.type !== undefined) patch.type = input.type;
    if (input.amount_cents !== undefined) patch.amount_cents = input.amount_cents;
    if (input.description !== undefined) patch.description = input.description;
    if (input.category_id !== undefined) patch.category_id = input.category_id;
    if (input.payment_method !== undefined) patch.payment_method = input.payment_method;
    if (input.occurred_on !== undefined) patch.occurred_on = input.occurred_on;

    const { data, error } = await supabase
      .from("transactions")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*, category:categories(id, name, color, icon)")
      .maybeSingle();
    if (error) throw Errors.internal();
    if (!data) throw Errors.notFound("That transaction");

    return NextResponse.json({ transaction: data });
  } catch (error) {
    return jsonError(error, "PATCH /api/transactions/[id]");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const { error, count } = await supabase
      .from("transactions")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw Errors.internal();
    if (!count) throw Errors.notFound("That transaction");
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, "DELETE /api/transactions/[id]");
  }
}
