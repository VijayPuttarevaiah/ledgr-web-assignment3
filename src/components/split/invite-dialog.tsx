"use client";

import { useState } from "react";
import { X, Check, Copy } from "lucide-react";
import { FieldLabel, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function InviteDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ inviteUrl: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setSending(true);
    setError("");
    const res = await fetch(`/api/groups/${groupId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json();
    setSending(false);
    if (!res.ok) {
      setError(body.error?.message ?? "Couldn't create that invite. Try again.");
      return;
    }
    setResult({ inviteUrl: body.inviteUrl, emailSent: body.emailSent });
  }

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-extrabold">Invite to group</div>
          <button onClick={onClose} aria-label="Close" className="text-text-dim hover:text-text">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm text-teal">
              <Check size={16} />
              {result.emailSent ? "Invite sent." : "Invite created."}
            </div>
            {!result.emailSent && (
              <div className="mb-3 text-[12.5px] text-text-dim">
                Email delivery isn&apos;t configured in this environment — share this link directly instead:
              </div>
            )}
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs break-all text-text-dim">
              {result.inviteUrl}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(result.inviteUrl);
                  setCopied(true);
                }}
                className="ml-auto shrink-0 text-gold"
                aria-label="Copy invite link"
              >
                <Copy size={14} />
              </button>
            </div>
            {copied && <div className="mb-3 text-xs text-teal">Copied to clipboard.</div>}
            <Button variant="ghost" onClick={onClose} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <>
            <FieldLabel htmlFor="inviteEmail" required>
              Email address
            </FieldLabel>
            <Input
              id="inviteEmail"
              type="email"
              className="mb-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {error && <div className="mb-3 text-[12.5px] text-coral">{error}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} loading={sending}>
                Send invite
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
