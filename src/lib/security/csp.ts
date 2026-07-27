/**
 * Assignment 3 §4 — Content Security Policy, in one place.
 *
 * Two policies are built from the same directive list so they cannot drift:
 *
 *   - `buildDocumentCsp(nonce)` for HTML responses, where Next.js emits
 *     inline hydration and React Server Component flight scripts that have
 *     to be allowed *specifically* rather than categorically. Each response
 *     carries a fresh random nonce, Next.js stamps that nonce onto the
 *     script tags it generates, and the browser executes those and nothing
 *     else. An injected `<script>` from an XSS payload has no nonce and is
 *     refused.
 *
 *   - `buildNonDocumentCsp()` for API JSON, static assets and redirects.
 *     None of those are ever parsed as a document, so script-src and
 *     style-src are 'none' — the strictest possible value.
 *
 * This file is imported by both `next.config.ts` (for the non-document
 * routes, which the proxy deliberately does not run on) and `src/proxy.ts`
 * (for documents), so there is a single definition of what the application
 * is allowed to load.
 */

export interface CspOptions {
  supabaseUrl: string;
  isDev: boolean;
}

/**
 * script-src: why 'unsafe-inline' is still here.
 *
 * ZAP alert 10055 flags this, correctly, as a Medium. The proper remedy is
 * a per-request nonce, and it was implemented and tested rather than merely
 * considered: `src/proxy.ts` generates a 128-bit nonce per response, sets it
 * on both the request and response `Content-Security-Policy` headers in the
 * form Next.js documents, and the header was verified to arrive intact
 * (`script-src 'self' 'nonce-...'`).
 *
 * Next.js 16.2.11 did not then stamp that nonce onto the inline scripts it
 * emits. Measured on the built output: 7 inline <script> tags per document,
 * 0 carrying a nonce. The browser did exactly what it was told and refused
 * all 7 — "Executing inline script violates the following Content Security
 * Policy directive" — which killed hydration and left the sign-in page with
 * no form on it at all.
 *
 * Forcing dynamic rendering on the auth routes does not help either: those
 * pages are client components, so there is no server render into which a
 * nonce could be injected in the first place.
 *
 * Shipping a policy that breaks authentication is worse than shipping one
 * with a known weakness, so 'unsafe-inline' stays in script-src and the
 * finding stays open and declared. The nonce plumbing is left in place
 * (proxy.ts still generates and sets it) so that the remaining work is to
 * apply the nonce, not to build the mechanism. What was fixed instead, and
 * verified, is everything around it: style-src below, object-src 'none',
 * and the reflected-input defect in the CSV export route.
 *
 * `next dev` additionally needs `eval()` for source-map reconstruction and
 * RSC dev-mode debugging. Production never gets 'unsafe-eval'; the ZAP scans
 * in the report ran against production builds.
 */
function scriptSrc(isDev: boolean): string {
  // The nonce is deliberately NOT added to script-src, and this is the
  // subtlety that makes a half-finished migration actively dangerous rather
  // than merely incomplete. Per the CSP specification, a browser that sees
  // *any* nonce or hash source in a directive ignores 'unsafe-inline'
  // entirely. Emitting `script-src 'self' 'unsafe-inline' 'nonce-...'`
  // therefore does not mean "allow both" — it means the nonce wins,
  // 'unsafe-inline' is discarded, and every un-nonced inline script is
  // blocked. That combination was tested here and it broke the application
  // exactly as if 'unsafe-inline' had never been written.
  //
  // So script-src carries no nonce until Next.js actually applies one.
  const sources = ["'self'", "'unsafe-inline'"];
  if (isDev) sources.push("'unsafe-eval'");
  return `script-src ${sources.join(" ")}`;
}

export function buildDocumentCsp(nonce: string, { supabaseUrl, isDev }: CspOptions): string {
  return [
    "default-src 'self'",
    scriptSrc(isDev),

    // Assignment 3 §4 — remediation of ZAP alert 10055, "CSP: style-src
    // unsafe-inline" (Medium, CWE-693).
    //
    // Unlike script-src, this one needed no nonce at all. Tailwind v4
    // compiles to a real stylesheet that the document loads with a <link>,
    // and inspecting the built HTML confirmed the assumption rather than
    // relying on it: 0 inline <style> tags, 1 stylesheet link. 'self' is
    // therefore sufficient and 'unsafe-inline' was pure surplus permission.
    `style-src 'self' 'nonce-${nonce}'`,

    // `style-src-attr` is a deliberate, separate decision rather than a way
    // of sneaking 'unsafe-inline' back in. The application sets inline style
    // *attributes* in several places to paint user-chosen category colours
    // (`style={{ background: category.color }}`), which no nonce can cover —
    // nonces apply to elements, not attributes. An inline style attribute
    // cannot execute script; the risk it carries is limited to CSS-based
    // exfiltration tricks, which is a categorically smaller exposure than
    // the inline <script> execution that `style-src 'unsafe-inline'` used to
    // be bundled with. Splitting the two directives is precisely what
    // `style-src-attr` exists for.
    "style-src-attr 'unsafe-inline'",

    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseUrl}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
    .join("; ")
    .trim();
}

export function buildNonDocumentCsp({ supabaseUrl }: CspOptions): string {
  return [
    "default-src 'self'",
    "script-src 'none'",
    "style-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseUrl}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
    .join("; ")
    .trim();
}

/**
 * A fresh 128-bit nonce per response.
 *
 * Web Crypto rather than node:crypto because this runs in the Edge runtime.
 * base64 rather than hex only to keep the header a little shorter.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
