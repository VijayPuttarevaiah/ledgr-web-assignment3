"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldError("");
    if (!email.includes("@")) {
      setFieldError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setFieldError("Enter your password.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes("invalid")
          ? "Invalid email or password. Check for typos, or reset your password below."
          : signInError.message
      );
      return;
    }
    router.push(searchParams.get("redirectTo") ?? "/dashboard");
    router.refresh();
  }

  async function handleGoogle() {
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) setError(oauthError.message);
  }

  return (
    <>
      <div className="mb-1 text-[26px] font-extrabold">Sign in</div>
      <div className="mb-6 text-[13px] text-text-dim">
        or{" "}
        <Link href="/sign-up" className="text-gold hover:underline">
          create a free account
        </Link>
      </div>
      <form onSubmit={handleSubmit} noValidate>
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
        <div className="relative mb-1.5">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className={`absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold ${showPassword ? "text-gold" : "text-text-dim"}`}
          >
            {showPassword ? "HIDE" : "SHOW"}
          </button>
        </div>
        <div className="mb-3.5 text-right">
          <Link href="/forgot-password" className="text-[12.5px] text-gold hover:underline">
            Forgot password?
          </Link>
        </div>
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
          {loading ? "Signing in…" : "Continue"}
        </Button>
      </form>
      <div className="my-4 text-center text-xs text-text-faint">or</div>
      <Button variant="ghost" onClick={handleGoogle} className="w-full py-3.5">
        Continue with Google
      </Button>
      <div className="mt-5 text-[13px] text-text-dim">
        New to LEDGR?{" "}
        <Link href="/sign-up" className="text-gold hover:underline">
          Create account →
        </Link>
      </div>
    </>
  );
}
