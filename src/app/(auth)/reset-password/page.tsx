"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FieldLabel, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(
        "That reset link has expired or was already used. Request a new one from the sign-in page."
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <div className="mb-1 text-[26px] font-extrabold">Choose a new password</div>
      <div className="mb-6 text-[13px] text-text-dim">Make it at least 8 characters.</div>
      <form onSubmit={handleSubmit} noValidate>
        <FieldLabel htmlFor="password" required>
          New password
        </FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          className="mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FieldLabel htmlFor="confirm" required>
          Confirm password
        </FieldLabel>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          className="mb-3"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <div className="mb-3.5 text-[12.5px] text-coral">{error}</div>}
        <Button type="submit" loading={loading} className="w-full py-3.5 text-[14.5px]">
          {loading ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </>
  );
}
