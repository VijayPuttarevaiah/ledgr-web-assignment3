"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FieldLabel, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Assignment 3 §4 — rendered per request rather than prerendered at build
 * time, so that the page Next.js serves is generated under the same
 * per-request Content Security Policy that src/proxy.ts sets on the
 * response. A statically prerendered page is one fixed .html file produced
 * before any nonce exists, which makes it impossible to reason about
 * nonce-bearing directives on these routes. They are trivial to render, so
 * the cost of doing it per request is negligible.
 */
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    // Always show success — don't reveal whether an account exists for this email.
    if (resetError) {
      setError("Couldn't send the reset email right now. Try again in a moment.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center text-center">
        <Check size={28} className="mb-3 text-teal" />
        <div className="mb-2 text-xl font-extrabold">Check your email</div>
        <div className="mb-6 text-sm text-text-dim">
          If an account exists for <strong className="text-text">{email}</strong>, we&apos;ve sent a link to reset
          your password.
        </div>
        <Link href="/sign-in" className="text-sm text-gold hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-1 text-[26px] font-extrabold">Reset your password</div>
      <div className="mb-6 text-[13px] text-text-dim">
        Enter the email on your account and we&apos;ll send a reset link.
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <FieldLabel htmlFor="email" required>
          Email
        </FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <div className="mb-3.5 text-[12.5px] text-coral">{error}</div>}
        <Button type="submit" loading={loading} className="w-full py-3.5 text-[14.5px]">
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <div className="mt-5 text-[13px] text-text-dim">
        <Link href="/sign-in" className="text-gold hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </>
  );
}
