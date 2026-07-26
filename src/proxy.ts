import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { getCache, hashKey } from "@/lib/cache/ttl-cache";

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/invite", "/auth"];

/**
 * Assignment 3 §2 — the Edge-runtime half of the session cache.
 *
 * Proxy runs before every page navigation and calls the Supabase Auth
 * server, and each Server Component then verifies the session again, so a
 * single page view cost two to three `/auth/v1/user` round-trips in the
 * baseline. This cache removes the proxy's share of them.
 *
 * It is registered as a separate named instance from the one in
 * `@/lib/api/session` rather than sharing it. Under `next start` the proxy
 * and the route handlers turn out to share a process — the metrics endpoint
 * reports both caches from one registry — but that is a property of this
 * deployment target, not a guarantee: on an edge deployment the proxy runs
 * in its own isolate with no access to the Node runtime's memory. Keeping
 * them separate means the code behaves identically either way, and the two
 * hit ratios can be read independently on the dashboard. Both use the same
 * implementation, key derivation and TTL, so their security properties are
 * identical.
 */
const proxySessionCache = getCache<User>({
  name: "session-verification-proxy",
  ttlMs: 30_000,
  maxEntries: 5_000,
});

/**
 * Refreshes the Supabase session cookie on every navigation and redirects
 * unauthenticated users away from protected pages. This is a UX convenience
 * only — per §9, every route handler independently re-verifies the session
 * server-side rather than trusting that Proxy already gate-kept the request
 * (a matcher change here must never become a silent auth bypass elsewhere).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const sessionCookies = request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((cookie) => `${cookie.name}=${cookie.value}`);

  let user: User | null = null;
  if (sessionCookies.length > 0) {
    const key = await hashKey(sessionCookies.join(";"));
    try {
      user = await proxySessionCache.getOrLoad(key, async () => {
        const {
          data: { user: verified },
          error,
        } = await supabase.auth.getUser();
        if (error || !verified) throw error ?? new Error("no user in session");
        return verified;
      });
    } catch {
      user = null;
    }
  }

  const { pathname } = request.nextUrl;
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // API routes must never be redirected to an HTML page — each Route
  // Handler enforces its own auth via requireUser() and returns a proper
  // 401 JSON response. Redirecting here would turn "unauthenticated" into
  // a misleading 200 (the sign-in page's HTML), which is exactly the kind
  // of proxy-vs-route-handler mismatch §9's defense-in-depth note warns
  // against — caught by an integration test asserting the real status code.
  if (pathname.startsWith("/api/")) {
    return response;
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/sign-in" || pathname === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // `api/` is excluded here (not just in the function body) so Proxy isn't
  // invoked at all for API traffic — a small latency win in addition to
  // the correctness fix above. The whole `_next/` tree is excluded, not
  // just `_next/static|_next/image` — `_next/webpack-hmr` (the dev-mode
  // HMR websocket upgrade) needs the same exclusion or Proxy's async
  // Supabase call intercepts the upgrade and breaks dev-mode hydration.
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
