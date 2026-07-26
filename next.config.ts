import type { NextConfig } from "next";

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

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js injects hydration/runtime scripts inline; a nonce-based CSP
  // would remove the need for 'unsafe-inline' here but is a larger change
  // than this pass covers — tracked as a documented follow-up, not silently
  // dropped.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]
  .join("; ")
  .trim();

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
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
