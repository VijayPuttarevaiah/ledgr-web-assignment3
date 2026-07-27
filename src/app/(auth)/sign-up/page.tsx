"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldError("");
    if (!fullName.trim()) {
      setFieldError("Tell us your name.");
      return;
    }
    if (!email.includes("@")) {
      setFieldError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setFieldError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (signUpError) {
      setError(
        signUpError.message.toLowerCase().includes("already registered") ||
          signUpError.message.toLowerCase().includes("already exists")
          ? "An account with that email already exists. Try signing in instead."
          : signUpError.message
      );
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    // Email confirmation is required in this deployment's Supabase Auth config.
    router.push("/sign-in?confirmEmail=1");
  }

  return (
    <>
      <div className="mb-1 text-[26px] font-extrabold">Create your account</div>
      <div className="mb-6 text-[13px] text-text-dim">
        Already on LEDGR?{" "}
        <Link href="/sign-in" className="text-gold hover:underline">
          Sign in
        </Link>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <FieldLabel htmlFor="fullName" required>
          Full name
        </FieldLabel>
        <Input id="fullName" className="mb-4" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <FieldLabel htmlFor="email" required>
          Email
        </FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FieldLabel htmlFor="password" required>
          Password
        </FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          className="mb-1.5"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="mb-3.5 text-[11.5px] text-text-faint">At least 8 characters.</div>
        {fieldError && <div className="mb-3 text-[12.5px] text-coral">{fieldError}</div>}
        {error && (
          <div
            role="alert"
            className="mb-3.5 rounded-lg border border-err-border bg-err-bg px-3 py-2.5 text-[12.5px] text-err-text"
          >
            {error}
          </div>
        )}
        <Button type="submit" loading={loading} className="w-full py-3.5 text-[14.5px]">
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </>
  );
}
