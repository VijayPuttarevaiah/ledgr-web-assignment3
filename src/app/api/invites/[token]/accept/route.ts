import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";

const FRIENDLY_MESSAGE: Record<string, string> = {
  invite_not_found: "This invite link isn't valid. Double-check the link, or ask for a fresh one.",
  invite_already_used: "This invite has already been used.",
  invite_expired: "This invite has expired — ask the group owner to send a new one.",
};

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("accept_group_invite", { p_token: token });
    if (error) {
      const known = FRIENDLY_MESSAGE[error.message];
      throw known ? Errors.conflict(known) : Errors.internal();
    }
    return NextResponse.json({ group: data });
  } catch (error) {
    return jsonError(error, "POST /api/invites/[token]/accept");
  }
}
