import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Errors } from "@/lib/api/errors";

/**
 * §9 — identity is always derived from the verified session server-side,
 * never trusted from client-supplied data. Every route handler that touches
 * user data calls this first.
 */
export async function requireUser(): Promise<{ user: User; supabase: Awaited<ReturnType<typeof createClient>> }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw Errors.unauthenticated();
  }
  return { user, supabase };
}
