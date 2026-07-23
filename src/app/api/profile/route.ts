import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { updateProfileSchema } from "@/lib/validation/settings";

export async function PATCH(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const input = updateProfileSchema.parse(await request.json());

    const { data, error } = await supabase.from("profiles").update(input).eq("id", user.id).select().single();
    if (error) throw Errors.internal();

    return NextResponse.json({ profile: data });
  } catch (error) {
    return jsonError(error, "PATCH /api/profile");
  }
}
