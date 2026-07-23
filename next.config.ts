import type { NextConfig } from "next";

// §9 / DAST pass (DECISIONS.md #security-headers): OWASP ZAP's baseline
// scan against a production build flagged missing X-Content-Type-Options,
// clickjacking protection, CSP, and Permissions-Policy, plus an
// X-Powered-By fingerprinting leak. All fixed here — re-scanned clean
// after this change (see DECISIONS.md for the before/after).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js injects hydration/runtime scripts inline; a nonce-based CSP
  // would remove the need for 'unsafe-inline' here but is a larger change
  // than this pass covers — tracked as a documented follow-up, not silently
  // dropped.
  "script-src 'self' 'unsafe-inline'",
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
