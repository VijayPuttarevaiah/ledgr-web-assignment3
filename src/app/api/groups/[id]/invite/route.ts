import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { inviteMemberSchema } from "@/lib/validation/groups";
import { logger } from "@/lib/logger";

/**
 * §6.4 group invites. Email delivery is best-effort: if no transactional
 * email provider is configured (RESEND_API_KEY unset — see DECISIONS.md),
 * the invite row and link are still created; the UI falls back to a
 * copyable link instead of relying on an email actually landing.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, supabase } = await requireUser();
    const { email } = inviteMemberSchema.parse(await request.json());

    const { data: membership } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) throw Errors.forbidden("You need to be a member of this group to invite people.");

    const { data: invite, error } = await supabase
      .from("group_invites")
      .insert({ group_id: id, email, invited_by: user.id })
      .select()
      .single();
    if (error) throw Errors.internal();

    const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/invite/${invite.token}`;

    if (process.env.RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.INVITE_EMAIL_FROM ?? "LEDGR <invites@ledgr.app>",
            to: email,
            subject: "You've been invited to a LEDGR group",
            html: `<p>You've been invited to join a group on LEDGR.</p><p><a href="${inviteUrl}">Accept invite</a></p><p>This link expires in 7 days.</p>`,
          }),
        });
      } catch (sendError) {
        logger.error({ err: (sendError as Error).message }, "Failed to send invite email via Resend");
      }
    } else {
      logger.warn({ route: "groups/[id]/invite" }, "RESEND_API_KEY not set — invite created without sending an email");
    }

    return NextResponse.json({ invite, inviteUrl, emailSent: Boolean(process.env.RESEND_API_KEY) }, { status: 201 });
  } catch (error) {
    return jsonError(error, "POST /api/groups/[id]/invite");
  }
}
