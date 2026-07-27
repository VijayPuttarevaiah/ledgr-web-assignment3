import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { getCache, hashKey } from "@/lib/cache/ttl-cache";
import { buildDocumentCsp, generateNonce } from "@/lib/security/csp";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isDev = process.env.NODE_ENV === "development";

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
  // Assignment 3 §4 — remediation of ZAP alert 10055 (Medium, CWE-693).
  //
  // A fresh nonce per response, placed on the *request* headers as well as
  // the response. Next.js looks for a `nonce-` value in the incoming
  // Content-Security-Policy header and, when it finds one, stamps that same
  // nonce onto every script tag it generates — its runtime bootstrap and
  // the React Server Component flight payload included. That is what allows
  // script-src to drop 'unsafe-inline': the browser now executes the
  // handful of inline scripts the framework vouched for, and refuses any
  // other inline script, which is the one that would have been injected.
  const nonce = generateNonce();
  const documentCsp = buildDocumentCsp(nonce, { supabaseUrl, isDev });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", documentCsp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", documentCsp);

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
          // Rebuilding the response here would silently drop both the nonce
          // request header and the CSP response header set above, and the
          // policy would simply go missing on exactly those requests where
          // Supabase rotated the session cookie — an intermittent hole that
          // a single-request scan would very likely never catch.
          response = NextResponse.next({ request: { headers: requestHeaders } });
          response.headers.set("Content-Security-Policy", documentCsp);
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

  /**
   * Assignment 3 §4 — remediation of ZAP alerts 10044 ("Big Redirect
   * Detected", Low, CWE-201) and 10019 ("Content-Type Header Missing",
   * Informational).
   *
   * A redirect built here carries no body and no CSP unless one is put on
   * it. Redirecting through a Server Component's `redirect()` instead
   * produced a full HTML document alongside the 307, which is what ZAP
   * flagged: a redirect that also ships a response body may leak whatever
   * is in that body to a client that was about to be sent elsewhere.
   * Redirecting in the proxy gives a bodyless response, and the headers are
   * attached explicitly so the policy does not go missing on this path.
   */
  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", documentCsp);
    redirect.headers.set("Content-Type", "text/plain; charset=utf-8");
    return redirect;
  };

  // `/` used to fall through to a Server Component whose only job was to
  // call redirect(); doing it here removes a full page render from the
  // hottest possible entry point as well as removing the oversized body.
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/dashboard" : "/sign-in";
    url.search = "";
    return redirectTo(url);
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirectTo", pathname);
    return redirectTo(url);
  }

  if (user && (pathname === "/sign-in" || pathname === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return redirectTo(url);
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
