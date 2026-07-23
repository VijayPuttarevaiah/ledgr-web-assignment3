import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { getGroupDetail } from "@/lib/groups";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const detail = await getGroupDetail(supabase, id, user.id);
    if (!detail) throw Errors.notFound("That group");
    return NextResponse.json(detail);
  } catch (error) {
    return jsonError(error, "GET /api/groups/[id]");
  }
}
