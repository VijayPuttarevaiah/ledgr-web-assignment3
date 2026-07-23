"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AcceptInviteClient({
  token,
  groupName,
  invitedByName,
  invitedEmail,
  isAuthenticated,
  currentUserEmail,
}: {
  token: string;
  groupName: string;
  invitedByName: string;
  invitedEmail: string;
  isAuthenticated: boolean;
  currentUserEmail: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const redirectTarget = `/invite/${token}`;
  const emailMismatch = isAuthenticated && currentUserEmail && currentUserEmail.toLowerCase() !== invitedEmail.toLowerCase();

  async function accept() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(body.error?.message ?? "Couldn't accept this invite. Try again.");
      return;
    }
    router.push("/split");
    router.refresh();
  }

  return (
    <div>
      <p className="mb-6 text-sm text-text-dim">
        <strong className="text-text">{invitedByName}</strong> invited you to join{" "}
        <strong className="text-text">{groupName}</strong> on LEDGR.
      </p>

      {!isAuthenticated ? (
        <div className="flex flex-col gap-2.5">
          <Link href={`/sign-up?redirectTo=${encodeURIComponent(redirectTarget)}`}>
            <Button className="w-full">Create account to join</Button>
          </Link>
          <Link href={`/sign-in?redirectTo=${encodeURIComponent(redirectTarget)}`}>
            <Button variant="ghost" className="w-full">
              I already have an account
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {emailMismatch && (
            <div className="mb-4 rounded-lg border border-err-border bg-err-bg px-3 py-2.5 text-[12.5px] text-err-text">
              This invite was sent to {invitedEmail}, but you&apos;re signed in as {currentUserEmail}. You can still
              accept if this is your invite.
            </div>
          )}
          {error && <div className="mb-4 text-[12.5px] text-coral">{error}</div>}
          <Button onClick={accept} loading={loading} className="w-full">
            {loading ? "Joining…" : `Accept and join ${groupName}`}
          </Button>
        </>
      )}
    </div>
  );
}
