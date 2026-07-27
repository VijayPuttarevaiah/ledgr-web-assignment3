import type { NextConfig } from "next";
import { buildNonDocumentCsp } from "./src/lib/security/csp";

// §9 / DAST pass (DECISIONS.md #security-headers): OWASP ZAP's baseline
// scan against a production build flagged missing X-Content-Type-Options,
// clickjacking protection, CSP, and Permissions-Policy, plus an
// X-Powered-By fingerprinting leak. All fixed here — re-scanned clean
// after this change (see DECISIONS.md for the before/after).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// `next dev` (Turbopack/React dev tooling) needs `eval()` for source-map
// reconstruction and RSC dev-mode debugging — Next.js explicitly warns
// about this in the console if a CSP blocks it. Production never needs or
// gets 'unsafe-eval'; the ZAP re-scan documented in DECISIONS.md ran
// against a production build, so this dev-only allowance doesn't change
// what was actually verified.
const isDev = process.env.NODE_ENV === "development";

// Assignment 3 §4 — remediation of ZAP alerts 10055 ("CSP: script-src
// unsafe-inline" and "CSP: style-src unsafe-inline", both Medium, CWE-693).
//
// The previous pass shipped 'unsafe-inline' in both directives, with a note
// admitting that a nonce-based policy was the real answer. 'unsafe-inline'
// in script-src is close to not having a script CSP at all: it tells the
// browser to execute any inline <script> it is handed, which is exactly the
// payload an injected-HTML XSS delivers.
//
// The policy is now split in two, both built in src/lib/security/csp.ts:
//
//   - HTML documents get a per-request nonce policy, set in src/proxy.ts.
//   - Everything the proxy does not run on — API JSON under /api and static
//     assets under /_next — gets script-src 'none' and style-src 'none'
//     here, because nothing in those responses is ever executed.
//
// The two `headers()` entries below are scoped so that exactly one CSP
// applies to any given path: no catch-all rule sets a document policy that
// the proxy would then have to fight with.
const nonDocumentCsp = buildNonDocumentCsp({ supabaseUrl, isDev });

const nextConfig: NextConfig = {
  poweredByHeader: false,

  experimental: {
    // Assignment 3 §2 — client-side optimisation 1 (bundle size).
    //
    // These three packages are barrel files: `import { Home } from
    // "lucide-react"` really imports an index module that re-exports well
    // over a thousand icon modules, and the bundler has to pull the barrel
    // in before it can decide what to drop. `optimizePackageImports`
    // rewrites those imports to their deep paths at build time, so only the
    // handful of icons, date helpers and chart primitives actually
    // referenced end up in a chunk.
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],

    // Assignment 3 §2 — client-side optimisation 2 (client-side caching).
    //
    // Next.js keeps an in-memory Router Cache of the RSC payload for each
    // visited route. Its default lifetime for dynamic routes is 0 seconds,
    // which means every navigation back to a page already visited seconds
    // ago goes back to the server for a fresh payload — measured on the
    // baseline as 6 RSC fetches across 6 navigations over three pages, ie.
    // no reuse at all.
    //
    // Raising `dynamic` to 30 s makes the second visit to a page within
    // that window render straight from memory: no network request, no
    // server render, no database work. 30 seconds is chosen against how
    // this app is actually used — a user flicking between Dashboard,
    // Ledger and Analytics is reading the same figures, and any edit they
    // make routes through `router.refresh()`, which busts the cache
    // regardless of the stale time. Financial figures still cannot go
    // stale behind the user's own back.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  async headers() {
    return [
      {
        // Applies everywhere. These four say nothing about scripts, so they
        // are the same for documents and for data.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Route handlers: the proxy matcher deliberately skips /api for
        // latency reasons, so the CSP for these responses is set here.
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: nonDocumentCsp }],
      },
      {
        // Build output. Also skipped by the proxy matcher.
        source: "/_next/:path*",
        headers: [{ key: "Content-Security-Policy", value: nonDocumentCsp }],
      },
    ];
  },
};

export default nextConfig;
