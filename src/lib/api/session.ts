import "server-only";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getCache, hashKey } from "@/lib/cache/ttl-cache";

/**
 * Assignment 3 §2 — server-side optimisation 1: cached session verification.
 *
 * `supabase.auth.getUser()` is not a local JWT check. It is an HTTPS call to
 * the Supabase Auth server (`GET /auth/v1/user`), which then queries
 * Postgres. Ledgr calls it on *every* authenticated request — once in
 * proxy.ts for page navigations and again inside the Server Component or
 * Route Handler — so a single dashboard view costs two auth round-trips
 * before any application work begins.
 *
 * The baseline JMeter run made the cost impossible to miss: at 50
 * concurrent users, 5,925 of 16,713 calls to `/auth/v1/user` came back as
 * HTTP 500 ("cannot assign requested address" — GoTrue had run out of
 * connections to Postgres), and every sampler that authenticates showed a
 * ~50% error rate while `/api/health` (which uses the service-role client
 * and never calls the auth server) and the static bundles stayed at 0%.
 * The application was not slow; it was being throttled by a dependency it
 * called far more often than it needed to.
 *
 * Verifications are therefore cached for 30 seconds, keyed by a SHA-256
 * hash of the session cookie, with concurrent verifications of the same
 * session coalesced into one upstream call.
 *
 * Security trade-off, stated explicitly rather than buried:
 *
 *   - Signing out is still immediate. supabase-js clears the cookie in the
 *     browser, the cookie value is the cache key, and a request with no
 *     session cookie short-circuits to "unauthenticated" without consulting
 *     the cache at all.
 *   - A token that is *rotated* (refresh) produces a different cookie value
 *     and therefore a different key, so it is re-verified immediately.
 *   - What the window does cover is server-side revocation: an
 *     administrator invalidating a session is honoured up to 30 seconds
 *     late. That is the price paid, and 30 s is chosen to be small against
 *     the one-hour access-token lifetime while still collapsing the
 *     per-request round-trip almost entirely.
 *   - Failed verifications are never cached, so a transient Auth outage
 *     cannot pin a user to a 401 for the rest of the TTL.
 */
const SESSION_TTL_MS = 30_000;

const sessionCache = getCache<User>({
  name: "session-verification",
  ttlMs: SESSION_TTL_MS,
  // Comfortably above any realistic concurrent-session count for this app,
  // and small enough that the map cannot grow without bound if it is ever
  // pointed at a token-spraying client.
  maxEntries: 5_000,
});

/** Concatenates the Supabase auth cookies, which `@supabase/ssr` may split across chunks. */
function sessionKeyFromCookies(entries: Array<{ name: string; value: string }>): string | null {
  const parts = entries
    .filter((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((cookie) => `${cookie.name}=${cookie.value}`);
  return parts.length > 0 ? parts.join(";") : null;
}

/**
 * Returns the verified user for the current request, or null.
 *
 * Behaviourally identical to calling `supabase.auth.getUser()` directly;
 * the only difference is how often the auth server actually hears about it.
 */
export async function getVerifiedUser(supabase: SupabaseClient<Database>): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionKey = sessionKeyFromCookies(cookieStore.getAll());

  // No session cookie at all: there is nothing for the auth server to
  // verify, so skip both the cache and the network call.
  if (!sessionKey) return null;

  const key = await hashKey(sessionKey);
  try {
    return await sessionCache.getOrLoad(key, async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      // Throwing rather than returning null keeps the failure out of the
      // cache: TtlCache only stores a fulfilled value.
      if (error || !user) throw error ?? new Error("no user in session");
      return user;
    });
  } catch {
    return null;
  }
}

/** Drops a session from the cache — used when a request invalidates its own session. */
export async function invalidateSession(cookieHeader: string): Promise<void> {
  sessionCache.delete(await hashKey(cookieHeader));
}
