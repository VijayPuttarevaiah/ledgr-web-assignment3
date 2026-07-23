import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { settleUpSchema } from "@/lib/validation/groups";

/** Bookkeeping only (§1 non-goal) — records a debt as paid, moves no real money. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await context.params;
    const { user, supabase } = await requireUser();
    const input = settleUpSchema.parse(await request.json());

    const { data: membership } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) throw Errors.forbidden();

    const { data: settlement, error } = await supabase
      .from("settlements")
      .insert({
        group_id: groupId,
        from_user_id: user.id,
        to_user_id: input.to_user_id,
        amount_cents: input.amount_cents,
        related_expense_ids: input.related_expense_ids,
        note: input.note ?? null,
        status: "settled",
        settled_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw Errors.internal();

    return NextResponse.json({ settlement }, { status: 201 });
  } catch (error) {
    return jsonError(error, "POST /api/groups/[id]/settle");
  }
}
