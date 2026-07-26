import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/api/session";
import { AcceptInviteClient } from "./accept-invite-client";

interface InvitePreview {
  group_name: string;
  invited_by_name: string;
  email: string;
  status: "pending" | "accepted" | "expired";
  expires_at: string;
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  const { data } = await supabase.rpc("get_invite_preview", { p_token: token }).maybeSingle();
  const preview = data as InvitePreview | null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-text">
      <div className="w-full max-w-md rounded-[16px] border border-border bg-surface p-8">
        <div className="mb-1 text-xl font-extrabold">You&apos;re invited</div>
        {!preview ? (
          <p className="text-sm text-text-dim">This invite link isn&apos;t valid. Double-check the link you were sent.</p>
        ) : preview.status === "expired" ? (
          <p className="text-sm text-text-dim">
            This invite has expired — ask {preview.invited_by_name} to send a new one.
          </p>
        ) : preview.status === "accepted" ? (
          <p className="text-sm text-text-dim">This invite has already been used.</p>
        ) : (
          <AcceptInviteClient
            token={token}
            groupName={preview.group_name}
            invitedByName={preview.invited_by_name}
            invitedEmail={preview.email}
            isAuthenticated={Boolean(user)}
            currentUserEmail={user?.email ?? null}
          />
        )}
      </div>
    </div>
  );
}
