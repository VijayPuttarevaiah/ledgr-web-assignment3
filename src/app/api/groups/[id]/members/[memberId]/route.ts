import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";

/**
 * §7.4 member management / leave-group flow. A member can always remove
 * themselves (leave); an owner can remove anyone. RLS
 * (`group_members_delete_self_or_owner`) is the actual authorization
 * boundary — this handler doesn't need to re-derive that logic, just
 * surface a clear error if RLS silently matched zero rows.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    const { id: groupId, memberId } = await context.params;
    const { supabase } = await requireUser();

    const { error, count } = await supabase
      .from("group_members")
      .delete({ count: "exact" })
      .eq("group_id", groupId)
      .eq("user_id", memberId);
    if (error) throw Errors.internal();
    if (!count) {
      throw Errors.forbidden("You can only remove yourself, or remove others if you own this group.");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, "DELETE /api/groups/[id]/members/[memberId]");
  }
}
