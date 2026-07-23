# LEDGR

Personal finance and collaborative bill-splitting, unified: a user's share
of any shared expense flows automatically into their personal ledger and
analytics — no manual reconciliation, ever. That auto-flow is the single
feature LEDGR exists to deliver; every other feature is built to protect it.

Built from [`LEDGR_BUILD_GUIDE.md`](./LEDGR_BUILD_GUIDE.md) and the original
UX report (personas Maya and Daniel — see `docs/RESEARCH_NOTES.md`). Design
and every heuristic-evaluation fix are documented in
[`DECISIONS.md`](./DECISIONS.md).

**Live URL:** not deployed — this build runs entirely against a local
Supabase instance by explicit choice at the start of this project (no live
Supabase/Vercel/Anthropic/Google Cloud accounts exist for this session).
See [Deploying for real](#deploying-for-real) below for the exact steps to
take this to production; nothing in `src/` is local-only, only the four
Supabase env vars change.

---

## Table of contents

- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [The AI kill switch](#the-ai-kill-switch)
- [API reference](#api-reference)
- [Testing](#testing)
- [Performance & security](#performance--security)
- [Deploying for real](#deploying-for-real)

---

## Quick start

**Prerequisites**: Node.js 20.9+ (built/tested on 26), Docker Desktop
(for local Supabase), the Supabase CLI (`brew install supabase/tap/supabase`
or see [supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli)).

```bash
# 1. Install dependencies
npm install

# 2. Start local Supabase (Postgres + Auth + Storage in Docker).
#    First run pulls several images and takes a few minutes.
supabase start

# This prints ANON_KEY / SERVICE_ROLE_KEY / PUBLISHABLE_KEY / SECRET_KEY
# for your local instance. .env.local is already checked in for this repo
# pointing at the standard local Supabase demo credentials (safe — they
# only ever authenticate against your own local Docker containers).

# 3. Run the dev server
npm run dev
# -> http://localhost:3000 (or whatever port it reports if 3000 is busy)
```

Sign up with any email/password (email confirmation is disabled for local
dev — `supabase/config.toml`'s `enable_confirmations = false` — so sign-up
logs you in immediately, no inbox needed).

**To reset the local database** (re-applies every migration + seed data
from scratch): `supabase db reset`.

**To inspect the database visually**: Supabase Studio at
`http://127.0.0.1:54323` once `supabase start` is running.

**To generate real receipt-parsing/categorization AI activity**: add a real
`ANTHROPIC_API_KEY` to `.env.local` and flip the four `AI_*_ENABLED`
/`NEXT_PUBLIC_AI_*_ENABLED` pairs to `"true"` (master switch **and** the
specific sub-feature). See [The AI kill switch](#the-ai-kill-switch).

---

## Environment variables

Every variable below, whether required or optional, is read in exactly one
place: `src/lib/ai/kill-switch.ts` (AI flags), `src/lib/supabase/*.ts`
(Supabase connection), or inline at each route handler that needs it. None
are duplicated or re-implemented per-route.

| Variable | Required? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **yes** | Supabase project URL, client-visible |
| `SUPABASE_URL` | **yes** | Same URL, server-side (admin client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **yes** | Public/publishable key — safe by RLS design |
| `SUPABASE_ANON_KEY` | **yes** | Same, server-side request-scoped client |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Secret — bypasses RLS. Server-only, never `NEXT_PUBLIC_*`. Used only by the recurring/rollover cron jobs and `ai_usage_log` writes. |
| `AI_FEATURES_ENABLED` | yes (default `"false"`) | Master AI kill switch. Must be the exact string `"true"` or every AI feature is off. |
| `NEXT_PUBLIC_AI_FEATURES_ENABLED` | yes (default `"false"`) | Client mirror — UI gating only, never authorization (§4.3). |
| `AI_CATEGORIZATION_ENABLED` / `NEXT_PUBLIC_...` | no (default `"false"`) | Category-suggestion sub-flag |
| `AI_OCR_ENABLED` / `NEXT_PUBLIC_...` | no (default `"false"`) | Receipt-scan sub-flag |
| `AI_NARRATIVE_ENABLED` / `NEXT_PUBLIC_...` | no (default `"false"`) | Analytics narrative sub-flag |
| `ANTHROPIC_API_KEY` | only if any AI feature is on | Used for categorization, OCR (vision), and narrative — see DECISIONS.md on the OCR vendor choice |
| `ANTHROPIC_MODEL_CATEGORIZATION` | no | Defaults to a small/fast Claude model |
| `ANTHROPIC_MODEL_NARRATIVE` | no | Defaults to a stronger Claude model |
| `GOOGLE_CLOUD_VISION_API_KEY` | no | Accepted as an alternative OCR credential (see DECISIONS.md) |
| `AI_MONTHLY_BUDGET_USD` | recommended | Hard spend cap — all AI auto-disables for the rest of the month once reached |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | no | Rate limiting; an in-memory limiter is used when unset (see DECISIONS.md) |
| `CRON_SECRET` | **yes** if using cron routes | Bearer-token check on both cron routes |
| `RESEND_API_KEY` | no | Group-invite emails; falls back to a copyable link when unset |
| `SENTRY_DSN` | no | Not wired up in this build — see DECISIONS.md |
| `LOG_LEVEL` | no | pino log level, default `info` |

---

## Project structure

```
src/
  app/
    (auth)/            sign-in, sign-up, forgot/reset-password
    (app)/              authenticated shell: dashboard, ledger, split, analytics, settings
    api/                every Route Handler — see API reference below
    invite/[token]/     group-invite accept screen
  components/           UI kit + feature components, one folder per feature area
  lib/
    split-math.ts        §6.1/§6.2 split math — pure, unit-tested, no I/O
    budget-rollover.ts    §6.3 rollover algorithm — pure, unit-tested
    recurring.ts          §6.5 date advancement — pure, unit-tested
    balances.ts           shared balance computation (Dashboard + Split Studio)
    ai/kill-switch.ts     the §4.2 resolution algorithm — one function, every AI route calls it
    supabase/             browser / server / admin Supabase clients
    validation/            zod schemas — the real server-side security boundary (§9)
  types/                 generated Supabase types + hand-written domain unions
supabase/
  migrations/             full schema, RLS policies, SECURITY DEFINER RPCs, storage policies, grants
  seed.sql                system default categories
tests/
  unit/                   Vitest — pure business logic, incl. property-based fuzzing
  integration/            Playwright — API auth boundaries, RLS isolation, kill-switch contract
  e2e/                    Playwright — Maya's and Daniel's full persona scenarios
```

---

## The AI kill switch

Full contract in `LEDGR_BUILD_GUIDE.md` §4; implementation in
`src/lib/ai/kill-switch.ts`, tested in `tests/unit/kill-switch.test.ts` and
`tests/integration/kill-switch.spec.ts`. The short version:

- One function (`resolveAIFeatureFlags` / `resolveAIFeature`) is the only
  way any route decides whether an AI feature is on. Never reimplemented
  ad hoc.
- Every AI route (`/api/transactions/categorize`, `/api/receipts/parse`,
  `/api/analytics/narrative`) returns HTTP **200** with
  `{ "enabled": false, "reason": "..." }` when off — never 404/403.
- When off, the AI-specific DOM elements (`data-testid="ai-categorize-
  badge"`, `"receipt-ocr-dropzone"`, `"ai-narrative-card"`) don't exist in
  the rendered output at all — not hidden, not disabled, absent.
- Client-visible `NEXT_PUBLIC_AI_*` flags only decide whether to *render an
  entry point*; every route independently re-verifies server-side
  regardless of what the client believes.

---

## API reference

All routes require a valid Supabase session unless noted; identity is
always derived from the verified session server-side (`requireUser()` in
`src/lib/api/auth.ts`), never trusted from client-supplied data. Every
handler enforces RLS as the ground truth and does its own explicit
authorization check as defense in depth.

| Method | Route | Purpose | AI-gated? |
|---|---|---|---|
| GET/POST | `/api/transactions` | List (paginated, filtered) / create, with non-blocking duplicate detection | No |
| PATCH/DELETE | `/api/transactions/:id` | Edit / delete | No |
| POST | `/api/transactions/bulk` | Bulk category-change or delete across selected rows | No |
| GET | `/api/transactions/export` | CSV export, respects the current filter | No |
| POST | `/api/transactions/categorize` | AI category suggestion | Yes — categorization |
| POST | `/api/receipts/parse` | AI receipt OCR (upload + parse in one call) | Yes — OCR |
| GET/POST | `/api/budgets` | Read / upsert a category's monthly budget | No |
| GET/POST | `/api/categories` | List / create custom categories | No |
| GET/POST | `/api/recurring-rules` | List / create recurring rules | No |
| PATCH/DELETE | `/api/recurring-rules/:id` | Pause/resume or delete a rule | No |
| GET/POST | `/api/groups` | List user's groups / create a group | No |
| GET | `/api/groups/:id` | Full group detail: members, expenses, balances | No |
| POST | `/api/groups/:id/invite` | Create an invite (email best-effort, link always returned) | No |
| POST | `/api/invites/:token/accept` | Accept an invite | No |
| GET/POST | `/api/groups/:id/expenses` | List / create (draft) a group expense | No |
| GET/PATCH | `/api/groups/:id/expenses/:expenseId` | Read / edit a draft expense | No |
| POST | `/api/groups/:id/expenses/:expenseId/items` | Add a line item (itemised mode) | No |
| DELETE | `/api/groups/:id/expenses/:expenseId/items/:itemId` | Remove a line item | No |
| POST | `/api/groups/:id/expenses/:expenseId/items/:itemId/assign` | Tap-to-assign a participant to an item | No |
| POST | `/api/groups/:id/expenses/:expenseId/confirm` | Lock in shares — triggers the auto-flow core mechanic | No |
| POST | `/api/groups/:id/expenses/:expenseId/reopen` | Reopen a confirmed split within its 24h window | No |
| GET | `/api/groups/:id/expenses/:expenseId/pdf` | Shareable PDF breakdown, generatable before confirming | No |
| POST | `/api/groups/:id/settle` | Record a settlement (bookkeeping only — no real money moves) | No |
| GET | `/api/analytics/summary` | KPIs + chart data for a time range | No |
| POST | `/api/analytics/narrative` | AI monthly-summary insights | Yes — narrative |
| PATCH | `/api/profile` | Update profile/preferences/notifications | No |
| DELETE | `/api/account` | Delete account (Danger Zone, re-validates the typed confirmation server-side) | No |
| GET | `/api/cron/recurring-transactions` | Cron-only (`CRON_SECRET`), daily, idempotent | No |
| GET | `/api/cron/budget-rollover` | Cron-only (`CRON_SECRET`), monthly | No |
| GET | `/api/health` | Liveness/readiness, checks real DB connectivity | No |

---

## Testing

```bash
npm run lint          # eslint
npm run typecheck      # tsc --noEmit
npm run test            # Vitest — unit tests, pure business logic
npm run test:playwright # integration + e2e (spins up a production build automatically)
npm run test:all        # everything
```

63 tests total: 51 unit (incl. property-based fuzzing of the split-math
reconciliation invariant across 200 randomized runs), 10 integration (auth
rejection, real two-account RLS cross-user isolation, the full kill-switch
HTTP contract), 2 end-to-end (Maya's and Daniel's full persona scenarios
from the original UX report, both run with AI off to prove graceful
degradation). See `DECISIONS.md` for why integration/e2e tests run against
a production build rather than `next dev`.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests on every
PR, plus a second job that spins up local Supabase and runs the full
Playwright suite against a production build.

---

## Performance & security

- **Performance**: `PERFORMANCE.md` — three client-side and two
  server-side optimizations, each with a real measured before/after number
  and a reproduction method.
- **Security**: RLS on every table, JWT-based auth via Supabase, zod
  validation as the real server-side boundary on every mutating route, a
  SAST pass (Semgrep, zero findings) and a DAST pass (OWASP ZAP baseline,
  findings fixed via `next.config.ts` security headers) — details and the
  before/after in `DECISIONS.md`'s §9 section.

---

## Deploying for real

Nothing in `src/` assumes local Supabase — only four env vars point at it.
To deploy for real:

1. Create a Supabase project. Run `supabase link --project-ref <ref>` then
   `supabase db push` to apply every migration (schema, RLS, storage
   policies, grants) to the real project. Enable Email and Google providers
   in Auth settings.
2. Create a Vercel project from this repo. Set every env var from the table
   above in the Vercel dashboard (Production, and Preview if you want AI
   on/off differently there).
3. Add the Vercel Cron Jobs from `vercel.json` (already configured —
   Vercel picks them up automatically on deploy) with `CRON_SECRET` set.
4. Point a custom domain at the Vercel project; HTTPS is automatic.
5. Run `npm run test:playwright` against the deployed preview URL
   (`PLAYWRIGHT_BASE_URL=https://your-preview-url npx playwright test`)
   before promoting to production.
6. If turning AI on: add real `ANTHROPIC_API_KEY` (and optionally
   `GOOGLE_CLOUD_VISION_API_KEY`), flip the four `AI_*_ENABLED` pairs to
   `"true"`, set `AI_MONTHLY_BUDGET_USD` to a real cap.

No step here provisions a VM, writes a Dockerfile for application hosting,
or configures a reverse proxy — every compute/database/storage/scheduling
need is satisfied by Vercel + Supabase, per §1's non-negotiable.
