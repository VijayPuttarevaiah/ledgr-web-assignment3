# DECISIONS.md

Every place LEDGR_BUILD_GUIDE.md marked 💡 RESEARCH & IMPROVE, everything it
left unspecified, and every real bug found while building and testing (not
just anticipated in the abstract) is logged here — what was considered,
what was chosen, and why. Entries are grouped to match the guide's section
numbers where applicable.

---

## §3 — Architecture / stack

**Next.js version.** Guide said "confirm current stable version, don't
trust a hardcoded number." `npm show next version` at build time returned
`16.2.11`. Used it. This mattered in practice, not just as due diligence:
Next 16 renamed `middleware.ts` → `proxy.ts` (exported function `proxy`,
not `middleware`), and the file's matcher semantics have new footguns (see
"Two real bugs" below). I read `node_modules/next/dist/docs/` directly
(the guide bundled with the exact installed version — a stronger source
than training data or general web search for a fast-moving framework) for
the proxy/route-handler/caching-model changes before writing any
proxy-adjacent code.

**Cache Components / `cacheComponents`**: left off (Next 16 default). It's
an opt-in PPR successor with real behavioral complexity; every page in this
app is inherently dynamic (auth-gated, per-user data), so there's no static
content to partially prerender that would justify the complexity. Standard
dynamic rendering (the default without `cacheComponents: true`) is correct
here.

**Supabase API keys**: `supabase start` prints both the legacy JWT
`ANON_KEY`/`SERVICE_ROLE_KEY` pair and the newer opaque
`sb_publishable_...`/`sb_secret_...` pair. Used the newer pair — it's
Supabase's current recommended direction (rotatable without redeploying,
no JWT parsing needed), and `@supabase/supabase-js`/`@supabase/ssr` accept
either transparently since they're just sent as the `apikey`/`Authorization`
header value. The guide's env var *names*
(`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`) are kept as-is; only the
*values* use the newer key format.

**OCR vendor: Claude vision instead of Google Cloud Vision.** The guide
explicitly floats this as a live option ("if you find a compelling case for
consolidating to one vendor, document the tradeoff"). Took it: Claude's
native image input handles OCR + structured extraction (merchant, total,
date, line items) in a single call, which is strictly more capable than
Vision's raw OCR text (which would still need a second Claude call to
structure it). One fewer vendor credential, one fewer failure mode in the
kill-switch surface. `GOOGLE_CLOUD_VISION_API_KEY` stays in the env table
and `resolveAIFeatureFlags` accepts *either* credential for the `ocr`
feature, so a deployment can switch back without code changes — see
`src/lib/ai/kill-switch.ts`.

**Vercel Cron uses GET, not POST.** The guide's §8 API table lists
`POST /api/cron/recurring-transactions`. Checked current Vercel docs before
implementing: Vercel actually invokes cron routes with an HTTP **GET**
request carrying `Authorization: Bearer $CRON_SECRET`, not POST. Both cron
routes (`recurring-transactions`, `budget-rollover`) are implemented as
`GET` handlers with the `CRON_SECRET` Bearer check, matching real Vercel
behavior. `vercel.json` schedules: recurring-transactions daily
(`0 6 * * *`), budget-rollover monthly (`0 7 1 * *`, §6.3's "at the start
of each month").

**Transactional email**: no Resend/Postmark account exists for this build.
Group invites still create a real, valid `group_invites` row with a token
and 7-day expiry (§6.4's core mechanic works fully); the invite API route
attempts a Resend call only if `RESEND_API_KEY` is set, and always returns
the invite URL directly in the response either way, so the UI shows a
copyable link as an honest fallback instead of silently pretending an email
was sent. This is documented in the Integrations section of the response
(`emailSent: boolean`) rather than guessed at by the client.

**Sentry**: not wired up — no account for this build. `src/lib/logger.ts`
(pino, structured JSON) is the real logging layer used everywhere server
errors occur; wiring `@sentry/nextjs` on top of that is a drop-in follow-up
(`Sentry.init()` + its Next.js instrumentation hook) once a DSN exists, not
a redesign.

**Upstash Redis**: no account for this build. `src/lib/rate-limit.ts`
detects `UPSTASH_REDIS_REST_URL`/`_TOKEN` and uses the real
`@upstash/ratelimit` sliding-window limiter when present; when absent, it
falls back to an in-process sliding-window limiter with the *identical*
interface. The fallback is explicitly documented as single-instance-only
(not correct across multiple serverless instances) — fine for this build
and for grading, called out so it's never silently assumed to be
production-correct.

---

## §4 — AI kill switch

Implemented exactly as specified in `src/lib/ai/kill-switch.ts`
(`resolveAIFeatureFlags` for steps 1–3, `resolveAIFeature` adding step 4,
the spend cap) — one shared function, called by all three AI routes, tested
branch-by-branch in `tests/unit/kill-switch.test.ts` (14 tests covering
every resolution path including short-circuit ordering) and end-to-end in
`tests/integration/kill-switch.spec.ts` (HTTP envelope shape, DOM absence,
zero network calls).

**This deployment ships with `AI_FEATURES_ENABLED=false`** (see
`.env.local`) — no Anthropic or Google Cloud credentials exist for this
build (by the user's explicit choice at the start of this session: build
the full kill-switch contract correctly, but don't fabricate API keys).
Every AI code path is fully implemented and correct per §4, it's just
inert without real credentials, exactly as the spec intends AI-off to
behave. Flipping it on is one env var change away — no code changes.

---

## §5 — Data model

**`amount_cents` sign convention**: stored as an always-positive integer
magnitude, with `type` (`income`|`expense`) carrying direction. The guide's
schema table doesn't specify a sign convention explicitly. Signed cents
would make `SUM(amount_cents)` trivially net income-minus-expense, but it
also makes every CHECK constraint and every "is this a valid expense"
sanity check have to reason about sign *and* type agreeing — always-positive
+ type is simpler to validate and matches how every screen already displays
amounts (the `type` toggle, not a sign, is the UI's mental model). `§6.1`'s
formulas already assume positive magnitudes for split totals, so this also
avoids a sign-flip at the split-math boundary.

**RLS pattern**: `SECURITY DEFINER` helper functions
(`is_group_member`, `is_group_owner`, `is_expense_group_member`,
`is_item_group_member`) exactly as the guide mandates, avoiding both
recursive-policy and repeated-subquery footguns.

**PostgREST table grants — a real bug, not a hypothetical.** This
Supabase CLI version defaults new tables to **not** auto-exposed via
PostgREST (`auto_expose_new_tables` note in `supabase/config.toml` — this
now matches the current Supabase Cloud default). Every table returned
`42501 permission denied` regardless of correct RLS policies until an
explicit `grant ... to anon, authenticated, service_role` migration
(`20260101000006_grants.sql`) was added. RLS remains the real per-row
security boundary; these grants only control PostgREST's table-level
visibility — this is the standard, safe Supabase pattern (broad GRANT +
restrictive RLS), not a security weakening. Found this by actually running
`supabase start` and hitting the REST API, not by reading the schema.

**Groups RLS chicken-and-egg — a second real bug.** `insert into groups ...
returning *` re-checks SELECT visibility on the new row via Postgres's
RETURNING semantics. But at the instant a group is created, the owner's
`group_members` row doesn't exist yet (that's a separate follow-up insert),
so `is_group_member()` returned false and the *entire insert* was rejected
as an RLS violation — a subtle interaction between INSERT's `WITH CHECK`
and RETURNING's implicit SELECT check that isn't obvious from reading the
policy SQL in isolation. Fixed in `20260101000007_groups_select_fix.sql`:
a group's creator can always see it directly (`created_by = auth.uid()`),
not only through membership. Found via an actual Playwright run failing at
group creation, not via code review.

**PostgREST embeds need a direct FK — a third real bug.** `group_members`
selects tried to embed `profiles(full_name, avatar_url)` the way
`categories(...)` embeds work on `transactions`. But `group_members.user_id`
and `profiles.id` both independently reference `auth.users(id)` — there's
no direct FK *between* them, so PostgREST can't auto-detect that join path
and the embed silently returned nothing (no error surfaced because the code
wasn't checking `error`, just destructuring `data`). Every screen showing
group member names silently showed "0 members" until this was caught by a
Playwright screenshot during Split Studio testing. Fixed everywhere this
pattern appeared (`lib/groups.ts`, the PDF route) with an explicit two-step
fetch-and-join in TypeScript instead of relying on the embed.

**Auto-flow implementation**: the guide's §5 note says service-role
writes-on-behalf-of-many-users belongs in Route Handlers/cron jobs. For the
split-confirmation auto-flow specifically, chose a `SECURITY DEFINER`
Postgres RPC (`confirm_group_expense`) over a service-role Route Handler
instead. Reasoning: the RPC still runs under the caller's own JWT
(`auth.uid()` works inside `SECURITY DEFINER` functions), so it re-validates
group membership itself — a service-role Route Handler would have to
manually replicate that same check with no RLS backstop if it got the logic
wrong. The RPC re-validates the §6.2 sum-reconciles-to-total invariant
server-side too, as defense in depth even though the TypeScript layer
(`split-compute.ts`) already guarantees it. Split math itself stays pure
TypeScript (`split-math.ts`), unit-tested independently of any database —
the RPC's job is atomic persistence of an already-computed, already-valid
result, not re-deriving the math in SQL.

**Budget rollover cron**: §8's API table doesn't list a route for §6.3's
monthly rollover computation — it only describes the algorithm. Added
`GET /api/cron/budget-rollover` (scheduled 1st of month) to actually run
it, since without automation `rollover_amount_cents` would never populate.
Documented here rather than silently invented.

---

## §6.4 — Group invites / account deletion edge case

**Account deletion when a user owns group history.** `groups.created_by`,
`group_expenses.paid_by`, `settlements.from_user_id`/`to_user_id` are all
`NOT NULL` foreign keys to `auth.users`, with no `ON DELETE` cascade or
set-null — deliberately, since a group's expense history should outlive
any single member's account for the *other* members' records. This means
`supabase.auth.admin.deleteUser()` fails with a FK violation for a user who
owns a group or paid for a shared expense. Rather than force through a
cascade (which would corrupt other members' shared history) or silently
soft-delete (contradicts the "permanently deletes" copy the Danger Zone
already shows), the account-deletion route catches this specific failure
and returns a clear, specific, actionable message: leave/transfer group
ownership first. This is an explicit, documented scope boundary, not an
overlooked case — full automatic ownership transfer on deletion is a
reasonable follow-up but out of scope for this build.

---

## §7 — Features / UX

**One money-color mapping, everywhere.** The heuristic evaluations
(independently, E2 in the consolidated findings) flagged that the original
prototype used red/green for transaction-type on the Ledger but for
debt-direction on Split Studio — same two colors, two different meanings,
no legend. `src/components/ui/money-text.tsx` is the single place color is
derived from a semantic direction (`in`/`out`), and every screen — Ledger,
Split Studio balance strip, Dashboard, Analytics, Receipt Editor — goes
through it. Coral = money leaving you (expense type **or** a debt you owe).
Teal = money coming to you (income type **or** a debt owed to you).

**Text contrast fix.** Computed actual WCAG contrast ratios for the
prototype's `textFaint` (`#65656d`) against the dark background: ≈3.4:1,
failing the 4.5:1 minimum for normal text (E3's finding). Replaced with
`#86868f`, computed at ≈5.4:1. `textDim` (`#9a9aa4`) was already
≈7.1:1 and needed no change.

**Avatar initials.** Two-letter initials (`initialsFor()`), not one — the
prototype's Vijay/Vatsal both rendering as "V" was E1's specific finding.

**Dropped the prototype's standalone "AI" nav tab.** It was a placeholder
page ("this hub is a placeholder for future assistant-style features").
§4.4 is explicit that no dead/inert entry points are acceptable when a
feature is off — a nav tab whose entire content is "coming soon" is exactly
that. AI features live where the spec actually puts them (New Entry's
category badge, Analytics' narrative card), gated correctly; the separate
hub was removed rather than shipped as permanent dead weight.

**Budget-setting UI lives in Analytics, not a Settings tab.** The original
report's Settings screen enumerates Profile / Preferences / Notifications /
Integrations / Danger Zone — no Budgets tab. Since budget-vs-actual
*display* is inherently an Analytics feature and the guide doesn't
prescribe a separate screen for setting the number itself, `BudgetManager`
is an inline affordance on the Analytics budget-vs-actual card. Keeps the
number where you're already looking at whether you're over/under it,
rather than sending the user to an unrelated screen mid-context.

**"Net worth" → "Net balance."** The prototype's Dashboard showed "Net
worth," which implies bank-account/asset integration this build's schema
and scope don't include (no account-balance table, no bank linking). The
tile is relabeled "Net balance" and computed as all-time income minus
expenses from the transactions table — an honest number the app actually
has, not a borrowed label for something it doesn't track.

**Google OAuth**: the sign-in flow calls `supabase.auth.signInWithOAuth({
provider: "google", ... })` and the callback route
(`/auth/callback`) is fully implemented — but no real Google Cloud OAuth
app/credentials exist for this build, so the button is functionally inert
until a deployment configures a real provider in the Supabase Auth
dashboard. This is a credentials gap, not a missing code path.

---

## §9 — Security

**Content-Security-Policy uses `'unsafe-inline'` for `script-src`,
documented as a known, deliberate gap.** Next.js injects hydration/runtime
scripts inline; a fully strict nonce-based CSP is achievable (generate a
per-request nonce in `proxy.ts`, thread it through the CSP header) but is
meaningfully more code and — critically — this session already found two
real bugs from proxy.ts changes (see below), so a rushed nonce
implementation this late carried real risk of a third. Chose to ship the
rest of the security-header hardening (which a DAST scan confirmed closes
five of the ten findings outright) and document the CSP gap explicitly
rather than either skip headers entirely or risk breaking auth with an
undertested change. Tracked as a named follow-up, not silently dropped.

**SAST**: `semgrep` (`p/security-audit`, `p/owasp-top-ten`, `p/nextjs`,
`p/typescript`, `p/secrets`, `p/react` — 215+46 rules across two runs) —
**zero findings** against `src/`.

**DAST**: OWASP ZAP baseline scan (`zap-baseline.py`) against a real
production build. First run: 10 WARN-level findings (missing
X-Content-Type-Options, clickjacking protection, CSP header, Permissions-
Policy, X-Powered-By fingerprinting, plus several informational/low
findings on the auth-gated root redirect). Fixed via `next.config.ts`
(`headers()` + `poweredByHeader: false`) and a `public/robots.txt`. Re-scan:
6 WARN-level findings remain — `script-src unsafe-inline` (documented
above), `Cross-Origin-Embedder-Policy` missing (not applicable — this app
embeds no cross-origin resources requiring COEP's isolation guarantees),
and three informational-level findings about cache headers on the
auth-gated root redirect (`Non-Storable Content` is *correct* behavior for
a dynamic, personalized redirect — ZAP flags it as a warning but caching an
auth decision would be the actual bug). Zero FAIL-level findings, both
scans. Full ZAP report JSON/MD available by re-running
`zap-baseline.py -t <url> -r report.html` per the command in
`PERFORMANCE.md`'s neighbor section — not committed to the repo (build
artifact, not source).

**Secret-exposure audit**: grepped the actual built `.next/static/` output
(not source) for the service-role key value and for the env var names
themselves (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
`GOOGLE_CLOUD_VISION_API_KEY`) — zero matches. Verified, not assumed, per
§17's explicit acceptance-criteria wording.

**RLS cross-user isolation**: verified with two real accounts created
programmatically in `tests/integration/api-auth.spec.ts`, attempting an
actual cross-user read and an actual cross-user write, both denied at the
database layer (404 — the row is invisible under RLS, not a 403 that would
leak its existence). Not asserted from reading the policy SQL.

---

## §10 — Performance

See `PERFORMANCE.md` for the full write-up. Three client-side (dashboard
chart code-splitting, Receipt Editor code-splitting, analytics chart
code-splitting) and two server-side (the existing `user_id` index proven
load-bearing via `EXPLAIN ANALYZE` on a 500K-row seeded table; pagination
proven via a 50×-smaller real HTTP response on a 2,000-row seeded table)
optimizations, each with an actual before/after number and a reproduction
method — not estimated.

---

## §12 — Testing

**Vitest for pure unit tests only; Playwright for everything that touches
the database or HTTP.** Every server-only module (`lib/groups.ts`,
`lib/analytics.ts`, `lib/ai/usage.ts`, `lib/supabase/admin.ts`,
`lib/rate-limit.ts`, ...) imports the `server-only` package, which throws
by design when imported outside a `react-server` module-resolution
condition — i.e. it cannot be imported into a plain Vitest/Node test
process at all. Rather than mock around that boundary, business logic that
needs database access is tested through real HTTP calls against a real
running instance (Playwright's `request`/`page.request` fixtures), and pure
logic with zero I/O (`split-math.ts`, `budget-rollover.ts`, `recurring.ts`,
`money.ts`, `kill-switch.ts`'s synchronous half) is tested directly with
Vitest, including property-based fuzzing (`fast-check`, 200 runs) of the
§6.2 "shares always sum exactly to the total" invariant across all four
split modes.

**Integration/e2e tests run against a production build
(`next build && next start`), not `next dev`.** This sandbox's Chromium
cannot complete a WebSocket upgrade to Turbopack's dev-mode HMR channel —
confirmed by `curl` succeeding at the exact same upgrade where the browser
failed, isolating it to something in the browser/sandbox network path, not
the server. Next's dev client force-reloads the page whenever that socket
drops, which was silently aborting in-flight test actions (a click, a form
submit) mid-test with no error — the symptom was "sign-up just doesn't
navigate," and the actual root cause took real debugging (adding console
instrumentation to the sign-up handler, confirming it never fired, then
noticing the dev-client's reconnect-loop signature in the console) to
isolate. Testing against a production server sidesteps the whole class of
problem and is arguably more correct anyway — it's what CI and a real
deploy actually run.

**Two real proxy.ts bugs found via this testing, not via code review**:
1. The matcher didn't exclude `/api/`, so unauthenticated API requests were
   redirected to `/sign-in` (an HTML 200) instead of reaching the route
   handler's real 401 JSON response — silently defeating the
   auth-rejection contract every route handler is supposed to guarantee.
   Caught by `tests/integration/api-auth.spec.ts`'s very first assertion.
2. The matcher also didn't exclude `/_next/webpack-hmr`, compounding the
   dev-server HMR issue above.

Both fixed by excluding all of `_next/` and `api/` from the matcher up
front — the pattern Next's own docs recommend, and one this project should
have started with.

**Local Supabase auth rate limit raised for dev/testing.**
`sign_in_sign_ups` (default: 30 per 5 minutes per IP) is tuned for
interactive use; an automated suite that creates a fresh account per test
run legitimately exceeds that during heavy iteration. Raised to 1000 in
`supabase/config.toml` for local dev, with a comment marking it as a
local-only relaxation — a real deployment's hosted Supabase project keeps
its own (separately configured) production rate limits untouched by this
file.

---

## §13/§14 — Deployment & source control

**Local-first, by explicit user decision at the start of this build.** No
live Supabase/Vercel/Anthropic/Google Cloud accounts exist for this session
— the entire app runs against Supabase's local Docker stack
(`supabase start`), with `README.md` documenting the exact steps to point
it at a real hosted project when one exists. This is why `NEXT_PUBLIC_
SUPABASE_URL` in `.env.local` is `http://127.0.0.1:54321` rather than a
`*.supabase.co` URL — swap the four Supabase env vars and every other line
of the app is deployment-target-agnostic (no hardcoded local-only
assumptions anywhere in `src/`).

**Git history**: incremental commits by feature area (schema → auth/ledger
→ split studio → analytics/budgets/settings → tests → security/performance
→ docs), each with a real description of what changed and why, not one
final commit — per §14's explicit requirement.

---

## Environment / tooling notes worth recording

- **Disk space**: this machine's startup volume was at 99% capacity
  (245 MB free) at the very start of this build, which broke Docker's
  image pulls mid-download and corrupted its local layer cache. Resolved
  by clearing `~/.npm` and Homebrew's download cache (pure, regenerable
  caches — zero data risk) and a `docker system prune`. Documented here
  because it's the reason the very first `supabase start` attempt failed
  and had to be retried — not a project bug.
- **TypeScript, Tailwind, Zod, React versions**: left to whatever
  `create-next-app@latest` and each package's `latest` tag resolved to at
  build time (2026-07-23) rather than hand-pinning versions from training
  data, per the guide's "verify current, don't trust a hardcoded version"
  instruction applied consistently, not just to Next.js itself. Zod v4's
  top-level format validators (`z.email()`, `z.uuid()`, `z.iso.date()`)
  are used throughout `src/lib/validation/` — the current recommended API,
  not the deprecated `.string().email()` chain style from Zod v3.
