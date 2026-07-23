import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { createGroupSchema } from "@/lib/validation/groups";

export async function GET() {
  try {
    const { user, supabase } = await requireUser();
    const { data: memberships, error } = await supabase
      .from("group_members")
      .select("group_id, role, groups(id, name, created_by, created_at)")
      .eq("user_id", user.id);
    if (error) throw Errors.internal();

    const groupIds = (memberships ?? []).map((m) => m.group_id);
    const { data: memberCounts } = groupIds.length
      ? await supabase.from("group_members").select("group_id").in("group_id", groupIds)
      : { data: [] as { group_id: string }[] };
    const countByGroup = new Map<string, number>();
    for (const row of memberCounts ?? []) countByGroup.set(row.group_id, (countByGroup.get(row.group_id) ?? 0) + 1);

    const groups = (memberships ?? []).map((m) => ({
      ...(m.groups as unknown as { id: string; name: string; created_by: string; created_at: string }),
      role: m.role,
      member_count: countByGroup.get(m.group_id) ?? 1,
    }));

    return NextResponse.json({ groups });
  } catch (error) {
    return jsonError(error, "GET /api/groups");
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const { name } = createGroupSchema.parse(await request.json());

    const { data: group, error } = await supabase.from("groups").insert({ name, created_by: user.id }).select().single();
    if (error) throw Errors.internal();

    const { error: memberError } = await supabase
      .from("group_members")
      .insert({ group_id: group.id, user_id: user.id, role: "owner" });
    if (memberError) throw Errors.internal();

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    return jsonError(error, "POST /api/groups");
  }
}
