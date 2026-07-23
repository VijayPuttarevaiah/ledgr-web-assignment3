import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { deleteAccountSchema } from "@/lib/validation/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * §7.1 Danger Zone. The confirmation phrase is re-validated here, not just
 * gated client-side (§9 — server-side validation is the real boundary).
 */
export async function DELETE(request: Request) {
  try {
    const { user } = await requireUser();
    deleteAccountSchema.parse(await request.json());

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      if (error.message.toLowerCase().includes("foreign key") || error.code === "23503") {
        throw Errors.conflict(
          "You still own a shared group or have paid for group expenses others rely on. Leave or transfer ownership of those groups first, then delete your account."
        );
      }
      logger.error({ err: error.message, userId: user.id }, "Account deletion failed");
      throw Errors.internal("Couldn't delete your account right now. Try again in a moment.");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, "DELETE /api/account");
  }
}
