import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";

const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const { active } = patchSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("recurring_rules")
      .update({ active })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();
    if (error) throw Errors.internal();
    if (!data) throw Errors.notFound("That recurring rule");

    return NextResponse.json({ rule: data });
  } catch (error) {
    return jsonError(error, "PATCH /api/recurring-rules/[id]");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const { error, count } = await supabase.from("recurring_rules").delete({ count: "exact" }).eq("id", id).eq("user_id", user.id);
    if (error) throw Errors.internal();
    if (!count) throw Errors.notFound("That recurring rule");
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, "DELETE /api/recurring-rules/[id]");
  }
}
