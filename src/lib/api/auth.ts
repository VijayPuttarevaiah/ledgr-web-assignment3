import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/api/session";
import { Errors } from "@/lib/api/errors";

/**
 * §9 — identity is always derived from the verified session server-side,
 * never trusted from client-supplied data. Every route handler that touches
 * user data calls this first.
 *
 * Assignment 3 §2: the verification itself now goes through the 30-second
 * in-memory session cache in `@/lib/api/session`, which removes one HTTPS
 * round-trip to the Supabase Auth server from every request. The contract
 * of this function is unchanged — an unverifiable session still throws.
 */
export async function requireUser(): Promise<{ user: User; supabase: Awaited<ReturnType<typeof createClient>> }> {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) {
    throw Errors.unauthenticated();
  }
  return { user, supabase };
}
