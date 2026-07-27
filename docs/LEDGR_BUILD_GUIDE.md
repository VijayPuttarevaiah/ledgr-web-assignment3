# LEDGR — Full Product Build Guide
### For an autonomous AI development agent. Read this entire document before writing any code.

**Source materials this guide is derived from (read these first if provided alongside this file):**
- `LEDGR_Assignment1_Report.pdf` — the original UX report: problem statement, personas (Maya, Daniel), all 8 prototype screens and their UX rationale.
- `LEDGR_Heuristic_Evaluations.md` / the 5 filled evaluation docs — usability findings from 5 independent evaluators.
- The interactive prototype (`LedgrPrototype.jsx` / `ledgr-prototype.zip`) — a working reference for layout, color system, copy tone, and the specific UX fixes already validated (confirmation dialogs, consistent color semantics, loading/error states, etc.). Treat its visual language as the starting point, not a ceiling.

This guide is the **specification layer**. It does not contain implementation code. Your job is to build the real, production-grade product from it — researching, deciding, and improving as you go, within the boundaries this document sets.

---

## 0. How to use this document

Two categories of instruction appear throughout, and they are marked so you never have to guess which kind you're looking at:

- **⚠️ MANDATORY** — a non-negotiable constraint. Do not deviate from these under any circumstance, regardless of what you find during research, unless you stop and get explicit human sign-off first. Violating one of these is treated as a failed build, even if everything else is excellent.
- **💡 RESEARCH & IMPROVE** — a sensible default. You are expected to verify it's still current best practice (things move fast; check dates on anything you read), and you are encouraged to improve on it, replace it, or extend it — provided you document what you changed and why in `DECISIONS.md` (see §15). Silent, undocumented deviation from a default is not acceptable; reasoned, documented improvement is exactly what's wanted.

Where this document is silent on something you encounter, apply the spirit of §0–§3 (the non-negotiables and the vision) and use your judgment — then document the decision.

**Before you write a single line of code:**
1. Read the whole document once, start to finish.
2. Re-read the original report's persona scenarios (Maya's receipt-import flow, Daniel's itemised restaurant split). Every feature you build should make those two scenarios work smoothly — they are your acceptance narratives.
3. Do the research pass described in §15 before touching the stack decisions in §3 — technology moves fast, and you should confirm current best practice rather than trusting any specific version number in this document as gospel six months from now.

---

## 1. Vision & Non-Negotiables

**One-line vision:** LEDGR is a personal finance and collaborative bill-splitting app where a user's share of any shared expense flows automatically into their personal ledger and analytics — no manual reconciliation, ever. That automatic flow is the single feature that differentiates LEDGR from Splitwise + a spreadsheet, and it must never be broken by any other decision made during the build.

### ⚠️ MANDATORY — the five constraints that override every other decision

1. **No self-managed servers, ever.** No VM you SSH into, no Docker container you operate, no bare-metal box, no "just for now" EC2 instance. Every compute, database, storage, auth, and scheduling need must be satisfied by managed/serverless platforms (see §3). If a feature idea requires a persistent server process you would have to patch and monitor yourself, redesign the feature or drop it.
2. **The AI kill switch contract in §4 is implemented exactly as specified**, with zero exceptions, because a finance app that breaks when a feature flag is flipped is a trust failure, not a bug.
3. **The core mechanic — shared expense share auto-flows into personal ledger — must work identically whether AI is on or off.** AI enriches data entry; it never gates core functionality.
4. **Security baseline in §9 is non-negotiable**, in particular: Row Level Security on every table, JWT-based auth, and no service-role/secret key ever reaching client-side code.
5. **All monetary arithmetic is done in integer cents (or your language's fixed-point equivalent), never floating point**, converting to decimal only at the display layer. A finance app with rounding drift is a broken finance app.

### Explicit non-goals (do not build these unless a human asks)

- No real payment processing or money movement. "Settle Up" records a debt as paid inside LEDGR's bookkeeping; it does not move real money. Actual payment happens outside the app (e-transfer, cash, etc.), exactly as the confirmation copy in the existing prototype already says.
- No native mobile app. Responsive web (and optionally an installable PWA) is the target.
- No multi-language UI at launch (English, Canadian conventions — matches the personas).
- No self-hosted anything (see constraint 1).

---

## 2. Grounding: who this is for and what "done" looks like

Re-read §1–§2 of the original report for full persona detail. The two acceptance narratives you're building toward:

- **Maya's scenario:** photograph a Costco receipt → AI parses it in under 2 seconds with a visible confidence score → she accepts → the transaction saves → she splits it three ways in Split Studio using the itemised editor → her $72.40 share appears in her personal ledger and Analytics Hub **immediately, with no separate step**. Total elapsed time target: under 90 seconds, matching the report's own benchmark.
- **Daniel's scenario:** on his phone, mid-trip, photograph a restaurant bill → itemised assignment by tapping avatars per line item → configurable proportional-vs-equal tax/tip allocation → live per-person totals as he taps → generate a shareable PDF/link before anyone pays → confirm split → group balance updates instantly.

If either scenario has a rough edge, friction, or a moment where the user has to "do math in their head," that is a bug against this spec, even if every individual feature technically works.

---

## 3. Architecture

### ⚠️ MANDATORY stack

| Layer | Choice | Why it satisfies "no servers" |
|---|---|---|
| Frontend + API | **Next.js (App Router), TypeScript, React** | Vercel builds and serves both the static/SSR frontend and the API layer (Route Handlers act as serverless functions) from one repo. No separate backend service to deploy or operate. |
| Hosting | **Vercel** | Auto-deploys from GitHub, autoscales, handles TLS/CDN/edge caching. Custom domain (e.g. `splitpro.app`) is attached via the Vercel dashboard + a DNS record at your registrar — no reverse proxy, no nginx, nothing to patch. |
| Database | **Supabase (managed Postgres)** | Fully managed Postgres with Row Level Security, automatic backups, connection pooling built in. You write SQL/migrations; Supabase runs the server. |
| Auth | **Supabase Auth** | Email/password + OAuth (Google), JWT-based sessions, managed. |
| File storage | **Supabase Storage** | Private buckets for receipt images, policy-gated the same way as the database (RLS-equivalent storage policies), signed URLs for temporary access. |
| Scheduled jobs (recurring transactions, monthly rollups) | **Vercel Cron Jobs**, calling a Route Handler, secured with a `CRON_SECRET` header check | No server daemon — Vercel invokes your function on schedule. Confirm current limits before relying on sub-daily frequency (as of this writing, Hobby-tier cron is capped at once/day; Pro tiers allow more — verify current limits for whatever plan is in use). |
| Rate limiting / AI spend caps | **Upstash Redis** (HTTP-based, serverless-native) | No persistent connection needed, works from edge/serverless functions. |
| Error tracking | **Sentry** (or equivalent) | Managed SaaS, no server to run. |
| Transactional email (invites, settlement reminders) | 💡 Research current best option (Resend, Postmark, or Supabase's built-in Auth email) | Pick whichever has the best free tier and deliverability for a student-scale project at build time. |

**Why this combination specifically satisfies the "fully automatically managed, no servers" requirement:** the only two dashboards you administer are Vercel and Supabase (plus the Anthropic and Google Cloud consoles purely for API key management). There is no SSH access anywhere in this architecture, no OS to patch, no uptime you are personally responsible for babysitting. Deploys happen automatically on `git push`.

### 💡 RESEARCH & IMPROVE

- Confirm the current stable Next.js major version before starting (`npm show next version`) and read its migration notes if it's newer than what you're used to — Next.js ships major versions roughly twice a year and this project should start on whatever is current and stable, not a legacy line.
- Investigate whether Vercel's current Cron Jobs tier limits fit the recurring-transaction cadence you need (daily is very likely sufficient — recurring transactions don't need to fire more than once a day) versus using Supabase's own `pg_cron` (enabled by default on Supabase projects) to run the same job entirely inside the database via a scheduled Edge Function. Either satisfies the "no servers" constraint; pick based on where the rest of your scheduled logic naturally lives, and document the choice.
- Consider whether Google Cloud Vision is still the right OCR provider versus using Claude's native vision input for receipt parsing (Claude models support image input and could plausibly replace a second vendor entirely, simplifying the kill-switch surface to one provider). The report specifies Google Cloud Vision + Claude as two separate services; if you find a compelling case for consolidating to one vendor, document the tradeoff in `DECISIONS.md` before switching — this is exactly the kind of improvement this guide wants you to propose, not silently do or blindly avoid.
- Whatever Claude model IDs you use, verify them against current documentation before hardcoding — model names and recommended-use-case guidance change. As of this writing, a small/fast model is appropriate for categorization (a narrow, cheap, high-volume task) and a stronger model is appropriate for the narrative-summary feature (a lower-volume, quality-sensitive task). Confirm current model names and pricing at build time rather than trusting any specific string in this document.

---

## 4. Environment Variables & the AI Kill Switch Contract

This is the single most important section of this document. Re-read it twice. Get it wrong and the whole product fails its central requirement.

### 4.1 Full environment variable table

| Variable | Scope | Required | Default if unset | Purpose |
|---|---|---|---|---|
| `AI_FEATURES_ENABLED` | server-only | yes | treat as `"false"` | **Master kill switch.** Must be the exact string `"true"` to allow any AI feature to run. Any other value, including empty string, whitespace, `"1"`, `"TRUE"`, or unset, means **all AI features are off**. |
| `NEXT_PUBLIC_AI_FEATURES_ENABLED` | client-visible mirror | yes, must exactly match `AI_FEATURES_ENABLED` | `"false"` | UI gating only (show/hide AI entry points). **Never used for actual authorization** — see §4.3. |
| `AI_CATEGORIZATION_ENABLED` | server-only | no | `"false"` | Sub-switch for Claude-based expense categorization. Meaningless unless master is `"true"`. |
| `NEXT_PUBLIC_AI_CATEGORIZATION_ENABLED` | client mirror | must match above | `"false"` | UI gating for the category-suggestion badge. |
| `AI_OCR_ENABLED` | server-only | no | `"false"` | Sub-switch for receipt OCR/auto-fill. |
| `NEXT_PUBLIC_AI_OCR_ENABLED` | client mirror | must match above | `"false"` | UI gating for the receipt-drop AI panel. |
| `AI_NARRATIVE_ENABLED` | server-only | no | `"false"` | Sub-switch for the AI monthly-summary narrative. |
| `NEXT_PUBLIC_AI_NARRATIVE_ENABLED` | client mirror | must match above | `"false"` | UI gating for the AI narrative card in Analytics. |
| `ANTHROPIC_API_KEY` | server-only, secret | only if any Claude feature is on | — | Never exposed to client. Used by categorization and narrative features. |
| `ANTHROPIC_MODEL_CATEGORIZATION` | server-only | no | a current small/fast Claude model — verify the exact ID at build time | Keeps model choice configurable without a redeploy of application logic. |
| `ANTHROPIC_MODEL_NARRATIVE` | server-only | no | a current high-quality Claude model — verify the exact ID at build time | Same reasoning. |
| `GOOGLE_CLOUD_VISION_API_KEY` (or service-account credentials, whichever auth method you choose) | server-only, secret | only if OCR is on | — | Never exposed to client. |
| `AI_MONTHLY_BUDGET_USD` | server-only | recommended | unset = no cap (not recommended for production) | ⚠️ MANDATORY behavior once set: if estimated monthly AI spend (tracked in `ai_usage_log`, see §5) exceeds this number, **all AI features auto-disable** for the remainder of the calendar month regardless of the individual flags, and this is logged clearly. This is a cost safety net, independent of the manual kill switch. |
| `CRON_SECRET` | server-only, secret | yes if using scheduled jobs | — | Verifies that incoming requests to cron-triggered routes actually came from your scheduler, not a public internet caller. |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | one secret, one public | yes | — | Standard Supabase connection info. |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public (safe by RLS design) | yes | — | Client-safe key; every table it can touch must have RLS policies. |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only, secret | yes | — | **Never** sent to the client, never used in any client-bundled code path. Used only inside Route Handlers/cron jobs for operations that must bypass RLS (e.g., the recurring-transaction cron job writing on behalf of many users). |

### 4.2 The resolution algorithm (⚠️ MANDATORY, implement exactly this logic)

For any AI feature `F` (categorization, OCR, or narrative), evaluate — **server-side, on every request, not once at startup**:

1. Is `AI_FEATURES_ENABLED` exactly `"true"`? If not → `F` is **OFF**. Stop.
2. Is the feature-specific flag (e.g. `AI_OCR_ENABLED`) exactly `"true"`? If not → `F` is **OFF**. Stop.
3. Is the required secret for `F` present and non-empty? If not → `F` is **OFF**, and log a clear server-side warning (e.g. `"AI_OCR_ENABLED=true but GOOGLE_CLOUD_VISION_API_KEY is missing — OCR disabled"`). Stop.
4. Is the monthly AI spend cap (if set) already exceeded? If so → `F` is **OFF**, logged clearly.
5. Only if all four checks pass is `F` **ON**.

This must be a single shared function/module used by every AI-adjacent Route Handler — never re-implemented ad hoc per endpoint, which is exactly how kill switches quietly grow inconsistent bugs.

### 4.3 Client vs. server responsibility (⚠️ MANDATORY)

- The `NEXT_PUBLIC_*` mirrors exist **only** to let the UI decide whether to render an AI entry point at all. They are a UX convenience, never a security boundary.
- Every AI-calling Route Handler **must independently re-run the full resolution algorithm server-side** before doing any work, regardless of what the client sent or believed. A tampered client bundle, a stale cached page, or a direct API call must never be able to trigger an AI call that the server-side flags say should be off.
- No client-side code may call `api.anthropic.com` or the Google Cloud Vision endpoint directly. All AI calls are proxied through your own Route Handlers, which hold the real secrets. This is both a security requirement and what makes the kill switch a true single source of truth.

### 4.4 Exact behavior when a feature is OFF (⚠️ MANDATORY — screen by screen)

| Screen / feature | AI ON | AI OFF |
|---|---|---|
| New Entry — category field | Text input pre-filled with an AI suggestion + a visible confidence badge (e.g. "AI: 94% match") the user can accept or overwrite. | Plain text input / dropdown of the user's own categories. **No badge element exists in the DOM at all** — not a greyed-out or disabled badge. No network call to Anthropic. |
| New Entry — receipt | A drop-zone that uploads the photo, shows a scanning state, and auto-fills amount/description/date/category on success, with an explicit failure state ("Couldn't read that clearly — try another photo or enter manually") on parse failure. | A plain "Attach receipt (optional)" file input that stores the image in Supabase Storage against the transaction, with zero parsing — every field is filled manually. **No AI drop-zone UI exists at all.** No network call to Google Vision. |
| Analytics Hub — narrative card | A 2–3 sentence plain-language summary generated from the user's real data, with a per-insight dismiss control and an "updated [time]" tag. | **The entire card is absent from the layout** — not shown empty, not shown as a locked/upsell placeholder. The KPI tiles and charts around it (which are not AI-derived) render exactly as they would otherwise. |
| Any screen | — | **No disabled/greyed-out button that does nothing when clicked is ever acceptable.** If a feature is off, its entry point does not exist in the markup. This was a specific finding in the heuristic evaluation of the original prototype (ambiguous disabled states) and must not recur here. |

### 4.5 Mandatory automated tests for this contract

Before this feature is considered complete, you must have automated tests (not just manual spot checks) that, with `AI_FEATURES_ENABLED=false`:
1. Assert that hitting the categorization, OCR, and narrative endpoints returns a clean, documented "disabled" response — **standardize on HTTP 200 with a body like `{ "enabled": false, "reason": "..." }`** for all three endpoints, rather than 404/403, so the client always has a consistent, well-formed contract to branch on instead of treating a disabled feature as a routing or auth error.
2. Assert, via a mocked/spied HTTP client, that **zero outbound requests** are made to `api.anthropic.com` or the Google Vision endpoint during a full run of the New Entry and Analytics flows.
3. Assert that the AI-specific DOM elements (give them stable `data-testid`s, e.g. `ai-categorize-badge`, `receipt-ocr-dropzone`, `ai-narrative-card`) are not present in the rendered output.
4. Repeat the same three assertions for each individual sub-flag turned off while the master stays on, to prove the per-feature granularity actually works independently.

Then run the same suite with everything on, and with the spend cap intentionally exceeded, to prove all four resolution branches behave as specified.

---

## 5. Data Model

💡 RESEARCH & IMPROVE the exact column types/indexes for your chosen Postgres version, but the entities, relationships, and the rules below are ⚠️ MANDATORY.

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (FK → `auth.users`), `full_name`, `avatar_url`, `default_currency` (default `'CAD'`), `created_at` | Mirrors Supabase Auth users; one row per user. |
| `categories` | `id`, `user_id` (nullable — null means system default, visible to everyone), `name`, `color`, `icon`, `is_system` | Seed with a sensible default set (Groceries, Dining, Transport, Housing, Entertainment, Health, Education, Income, Other); users can add their own. |
| `transactions` | `id`, `user_id`, `type` (`income`\|`expense`), `amount_cents` (integer, ⚠️ never a float), `description`, `category_id`, `payment_method`, `occurred_on` (date), `is_recurring`, `recurring_rule_id` (nullable FK), `source_group_expense_id` (nullable FK — set when this row was generated by a confirmed Split Studio expense, this is the field that implements the "auto-flow" core mechanic), `receipt_image_path` (nullable), `ai_category_confidence` (nullable), `created_at`, `updated_at` | |
| `recurring_rules` | `id`, `user_id`, template fields (amount, description, category, type), `frequency` (`weekly`\|`monthly`), `next_run_on`, `active` | Driven by the cron job in §3, not by AI, ever. |
| `budgets` | `id`, `user_id`, `category_id`, `month` (first-of-month date), `base_amount_cents`, `rollover_amount_cents` (default 0) | See §6 for the rollover algorithm — it is fully specified there, do not improvise it. |
| `groups` | `id`, `name`, `created_by`, `created_at` | |
| `group_members` | `group_id`, `user_id`, `role` (`owner`\|`member`), `joined_at` — composite PK | |
| `group_invites` | `id`, `group_id`, `email`, `invited_by`, `token`, `status` (`pending`\|`accepted`\|`expired`), `expires_at` | Needed even though the original report doesn't fully specify group-joining — see §6.4. |
| `group_expenses` | `id`, `group_id`, `description`, `total_amount_cents`, `paid_by` (user_id), `occurred_on`, `split_mode` (`equal`\|`itemised`\|`exact`\|`weighted`), `tax_amount_cents`, `tip_amount_cents`, `tax_allocation` (`proportional`\|`equal`), `tip_allocation` (`proportional`\|`equal`), `discount_amount_cents`, `receipt_image_path`, `status` (`draft`\|`confirmed`), `created_at` | |
| `group_expense_items` | `id`, `group_expense_id`, `item_name`, `quantity`, `unit_price_cents` | Only populated for `itemised` mode. |
| `group_expense_item_assignments` | `item_id`, `user_id` — composite PK, many-to-many | Multiple people can share one line item. |
| `group_expense_shares` | `id`, `group_expense_id`, `user_id`, `weight` (nullable, for `weighted`), `exact_amount_cents` (nullable, for `exact`), `computed_share_cents` | The final, locked-in per-person amount once an expense is confirmed — see §6.2 for the exact math. |
| `settlements` | `id`, `group_id`, `from_user_id`, `to_user_id`, `amount_cents`, `related_expense_ids` (array), `status` (`pending`\|`settled`), `settled_at`, `note` | Bookkeeping only — see the non-goals in §1. |
| `ai_usage_log` | `id`, `user_id`, `feature` (`categorization`\|`ocr`\|`narrative`), `model`, `estimated_cost_usd`, `created_at` | Powers the spend cap in §4.1. Inserted only server-side, never from client code. |

### RLS requirements (⚠️ MANDATORY)

- **Row Level Security must be enabled on every single table above.** A table without RLS in this schema is a bug, full stop.
- For personal tables (`transactions`, `budgets`, `recurring_rules`, `categories` where `user_id` is not null): policy is simply "row's `user_id` = `auth.uid()`" for select/insert/update/delete.
- For group-scoped tables (`group_expenses` and everything under it, `settlements`): 💡 RESEARCH & IMPROVE the exact policy syntax, but the mandatory pattern is: write a `SECURITY DEFINER` Postgres helper function (e.g. `is_group_member(group_id uuid) returns boolean`) and reference it in your policies, rather than writing a naive recursive `EXISTS` subquery per policy. This avoids both a correctness footgun (RLS recursion) and a performance footgun (repeated subqueries per row) — verify this is still the recommended pattern at build time, but it was the consensus approach as of this writing.
- `ai_usage_log`: users can `select` their own rows only; all `insert`s happen via the service-role key from within a Route Handler, never from client code.
- The Supabase `anon` key must never be able to read or write anything it isn't explicitly policy-permitted to — verify with a real (not just assumed) test: attempt a cross-user read with a second test account and confirm it is denied by the database, not merely hidden by the UI.

---

## 6. Business Logic — exact specifications (no ambiguity)

These formulas are ⚠️ MANDATORY. They exist specifically because "just split it fairly" is exactly the kind of instruction that produces inconsistent, hard-to-debug financial math if left to interpretation.

### 6.1 Split modes

- **Equal:** `total_amount_cents / participant_count`, integer division. Any leftover cents (from a division that doesn't come out even) are added to the share of whoever is recorded as `paid_by`.
- **Exact amounts:** each participant's `exact_amount_cents` is entered directly. The sum of all `exact_amount_cents` **must equal** `total_amount_cents` before the split can be confirmed — validate this and block confirmation with a clear inline error if it doesn't reconcile.
- **Weighted:** each participant has a `weight` (positive number). Share = `round(total_amount_cents * weight / sum_of_all_weights)`. Any rounding remainder goes to the participant with the largest weight (tie-break: whoever paid).
- **Itemised:** for each line item, `line_total_cents = quantity * unit_price_cents`, split evenly among everyone assigned to that item (if 3 people are tagged on one item, each owes 1/3 of that item's line total, with any remainder going to the first-assigned participant for that item).

### 6.2 Tax, tip, and discount allocation (itemised mode)

1. Compute each participant's **item subtotal** (sum of their per-item shares from §6.1's itemised rule).
2. Apply the **discount** proportionally: each participant's adjusted subtotal = `item_subtotal - (discount_amount_cents * item_subtotal / bill_subtotal_cents)`.
3. Compute tax per participant:
   - `proportional`: `tax_amount_cents * adjusted_subtotal / bill_subtotal_cents` (i.e., scaled by their own share of the bill).
   - `equal`: `tax_amount_cents / participant_count`, flat regardless of what they ordered.
4. Compute tip the same way, using whichever of `proportional`/`equal` was selected for tip (independently of the tax choice — a group may reasonably want proportional tax and equal tip, or vice versa; the report is explicit that this must be configurable per split, not global).
5. Each participant's final `computed_share_cents` = adjusted subtotal + their tax share + their tip share, rounded to the nearest cent.
6. **The sum of every participant's `computed_share_cents` must exactly equal `total_amount_cents`.** If rounding leaves a ±1 cent discrepancy after step 5, assign the remainder to whoever is `paid_by`. Write an automated test that asserts this invariant across randomized inputs (property-based testing is ideal here, if your test framework supports it) — this is a finance app, and "it's off by a cent sometimes" is not an acceptable outcome.

### 6.3 Budget rollover

- At the start of each month, for each category budget: if the **previous** month's actual spend was **less than** its `base_amount_cents`, the surplus (`base_amount - actual_spend`) rolls forward into the new month's `rollover_amount_cents`, **capped at 50% of that category's `base_amount_cents`** (to prevent unbounded accumulation from a permanently under-spent category).
- If the previous month's actual spend **exceeded** the budget, the deficit does **not** carry forward — the new month starts at its full `base_amount_cents` regardless of last month's overspend. The overspend remains visible in historical Analytics; it just doesn't shrink next month's fresh budget.
- Effective budget for any month = `base_amount_cents + rollover_amount_cents`.
- If you find strong evidence this rule should work differently for LEDGR's target users, document the alternative and the reasoning in `DECISIONS.md` before implementing it — don't silently pick a different rule.

### 6.4 Group invites (not fully specified in the original report — this fills that gap)

- A group owner can invite by email. This creates a `group_invites` row with a random token and a 7-day expiry.
- 💡 RESEARCH & IMPROVE the exact email-delivery mechanism (§3's transactional email provider), but the flow is ⚠️ MANDATORY: invite created → email sent with a link containing the token → recipient (whether or not they already have an account) lands on an accept screen → on accept, if they don't have an account yet they're routed through sign-up first, then added to `group_members` and the invite marked `accepted`.
- Expired or already-used tokens must show a clear, specific message ("This invite has expired — ask [inviter] to send a new one"), not a generic error.

### 6.5 Recurring transactions

- Driven entirely by the cron job in §3 — this is a pure data operation and must **never** be gated by the AI kill switch, reinforcing that turning AI off cannot break unrelated functionality.
- Daily cron: find every `recurring_rules` row where `next_run_on <= today` and `active = true`, insert the corresponding `transactions` row, advance `next_run_on` by the rule's `frequency`.
- Must be idempotent — running the job twice in the same day for the same rule must not create duplicate transactions (e.g., check whether a transaction already exists for that rule + date before inserting).

---

## 7. Feature Specification (exhaustive)

Each feature is tagged **[AI]** if it depends on an AI kill-switch flag (and must therefore fully honor §4), or **[core]** if it must work identically regardless of AI state.

### 7.1 Auth & Account — [core]
- Email/password sign-up and sign-in, Google OAuth, password reset.
- Session handling via Supabase Auth JWTs.
- Forgot-password link on the sign-in screen (a specific gap identified in the heuristic evaluation of the original prototype — do not omit it here).
- Account deletion flow in Settings → Danger Zone, requiring the user to type a confirmation phrase before the action is enabled, per the original report's Danger Zone description.

### 7.2 Personal Ledger — [core]
- Full transaction CRUD with inline edit.
- Filters: All / Income / Expenses / Recurring / Shared (matching the original report's screen 03).
- Summary strip: total income, total expenses, net, transaction count for the selected period — computed and shown before the user reads any individual row.
- Custom categories, color-coded consistently with every other screen that shows category color (dashboard, analytics) — one color-to-category mapping, defined once, used everywhere.
- Pagination (not infinite scroll — the report explicitly calls this out as a deliberate choice for user control).
- Bulk actions: multi-select rows for bulk category change / delete (a gap identified in the heuristic evaluation — the original prototype required editing 143 rows one at a time).
- CSV export. 💡 RESEARCH & IMPROVE format specifics (plain CSV vs. a richer export) but this is expected functionality for a finance app.

### 7.3 New Entry — [core] + [AI] enrichments
- Side-panel form (not a centered modal) that keeps the ledger visible behind it, per the original report's rationale (context retention, fewer duplicate entries).
- Required fields marked clearly; Expense/Income toggle with a strong visual distinction so a user can't mistake one for the other.
- **[AI]** Category suggestion badge with confidence score (categorization sub-flag).
- **[AI]** Receipt photo upload with OCR auto-fill (OCR sub-flag); **[core]** fallback: plain optional file attachment with fully manual field entry when OCR is off or fails.
- "Make this recurring" toggle, wired to `recurring_rules` — present regardless of AI state, this is pure data, not AI.
- Duplicate-transaction detection: warn (don't block) if a very similar transaction (same amount ± a small tolerance, same day, similar description) already exists.

### 7.4 Split Studio — [core]
- Two-panel layout: group list (left) + selected group detail (right), per the original report's screen 05.
- Balance summary strip always visible and always current — never requires a manual recalculation trigger.
- Four split modes per expense (equal, itemised, exact, weighted) — see §6.1 for the exact math. Each expense in a group can independently use a different mode.
- Group creation, invites (§6.4), member management, leave-group flow.
- Settle Up requires an explicit confirmation dialog stating clearly that this only records the debt as paid and does not move real money (matches the fix already validated in the prototype's heuristic-evaluation pass).

### 7.5 Receipt Editor — [core] + [AI] enrichment
- Full-canvas panel (not a small modal) matching the scale of the task.
- Tap-to-assign avatars per line item, multiple people per item supported, live per-person total as assignments change (direct manipulation, per the report's UX rationale) — this interaction is **not** AI-dependent; it works purely on manually-entered or OCR-populated line items either way.
- **[AI]** OCR populates the initial line items from a photographed receipt when the OCR sub-flag is on; **[core]** manual line-item entry is always available as a fallback or a first-class path.
- Per-split configurable tax/tip allocation (proportional vs. equal), independently for tax and tip — see §6.2.
- Generate a shareable PDF/link of the final breakdown before confirming, so every participant can verify the math before money changes hands (Daniel's explicit ask in his persona scenario).
- Confirm Split requires a confirmation step; allow reopening a confirmed split for a short window (a gap identified in the heuristic evaluation) rather than treating confirmation as instantly and permanently final.

### 7.6 Analytics Hub — [core] + [AI] enrichment
- Time-range selector (1D/1W/1M/3M/1Y/All).
- Five KPI tiles computed and shown on load: spending, income, savings rate, shared-expense proportion, budget adherence.
- Cash-flow chart (income vs. expense over time), category breakdown, budget-vs-actual with progress bars that turn to the "over budget" color the instant a category crosses its target — and show the dollar amount over/under, not percentage alone (a specific fix from the heuristic evaluation).
- **[AI]** Narrative card: a plain-language, specific (not vague) summary generated from the user's own data, naming the actual over/under-budget category and a concrete suggestion — not generic filler text. Dismissible per-insight. Absent entirely when the narrative sub-flag is off (§4.4).

### 7.7 Settings — [core]
- Profile, Preferences (currency, date format, default payment method), Notifications (toggle switches, consistent visual pattern with any other toggle in the app), Integrations, Danger Zone.
- Discard and Save Changes both visible at all times, equal visual weight, no auto-save-on-change (per the original report's explicit rationale for user control).

### 7.8 Cross-cutting / non-functional features — [core]
- Empty states for every list/table (new user with zero transactions, a group with zero expenses, etc.) that clearly invite the next action rather than showing a blank void.
- Full keyboard navigation and visible focus states on every interactive element.
- WCAG AA color contrast on all text, especially secondary/helper text (a specific gap flagged in the heuristic evaluation).
- Toast notifications and confirmation dialogs follow one consistent visual pattern app-wide (already validated in the existing prototype — carry it through).
- One consistent color mapping for "money in" vs. "money out" across every single screen (a specific, previously-identified inconsistency between the Ledger and Split Studio in the original design — do not reintroduce it).

---

## 8. API Contract

💡 RESEARCH & IMPROVE exact route naming conventions, but the endpoint surface below is expected. Every endpoint requires a valid session unless noted. Every endpoint enforces RLS at the database layer as defense in depth, even though the route handler is also expected to check authorization explicitly (belt and suspenders — see §9).

| Method | Route | Purpose | AI-gated? |
|---|---|---|---|
| `POST` | `/api/auth/*` | Handled mostly by Supabase Auth directly from the client SDK; only custom flows (e.g., post-signup profile creation) need a route handler. | No |
| `GET/POST` | `/api/transactions` | List (paginated, filterable) / create. | No |
| `PATCH/DELETE` | `/api/transactions/:id` | Edit / delete a transaction. | No |
| `POST` | `/api/transactions/categorize` | Returns an AI category suggestion for a description/amount. Returns the standardized disabled-envelope when off (§4.5). | Yes — categorization |
| `POST` | `/api/receipts/parse` | Uploads a receipt image, returns parsed fields. Standardized disabled-envelope when off. | Yes — OCR |
| `GET/POST` | `/api/budgets` | Read/set category budgets for a month. | No |
| `GET/POST` | `/api/groups` | List user's groups / create a group. | No |
| `POST` | `/api/groups/:id/invite` | Create a group invite (§6.4). | No |
| `POST` | `/api/invites/:token/accept` | Accept an invite. | No |
| `GET/POST` | `/api/groups/:id/expenses` | List / create group expenses. | No |
| `POST` | `/api/groups/:id/expenses/:expenseId/confirm` | Locks in `computed_share_cents` per the math in §6.1–§6.2. | No |
| `POST` | `/api/groups/:id/settle` | Records a settlement (bookkeeping only, per §1's non-goals). | No |
| `GET` | `/api/analytics/summary` | KPI tiles + chart data for a time range. | No |
| `POST` | `/api/analytics/narrative` | AI monthly-summary text. Standardized disabled-envelope when off. | Yes — narrative |
| `POST` | `/api/cron/recurring-transactions` | Cron-triggered, requires `CRON_SECRET` header match, not a user-facing endpoint. | No |
| `GET` | `/api/health` | Basic liveness/readiness check — useful for confirming a deploy is healthy without needing to open the UI. | No |

---

## 9. Security Requirements

⚠️ MANDATORY, aligned with the course rubric's Security Mechanisms criterion:

- **Authentication:** JWT-based via Supabase Auth, on every request that touches user data.
- **Authorization:** RLS on every table (§5) as the ground truth, plus explicit route-handler checks as defense in depth — never rely on the client to send a correct `user_id`; always derive identity from the verified session server-side.
- **Input validation on both client and server.** Client-side validation is a UX nicety; server-side validation (using a schema library — 💡 research current options) is the actual security boundary. Never trust client-supplied data, including amounts, category IDs, or group membership claims.
- **Secrets never reach the client bundle.** Audit this explicitly: `ANTHROPIC_API_KEY`, `GOOGLE_CLOUD_VISION_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must never appear in any `NEXT_PUBLIC_*` variable or in any client component's bundled code.
- **Rate limiting** on every AI-calling endpoint (via Upstash Redis, §3) — both to control cost and to prevent abuse.
- **SAST/DAST:** 💡 research and run a current static-analysis tool (e.g., GitHub CodeQL or equivalent) and a dynamic scan (e.g., OWASP ZAP) before considering the security pass complete, and **fix what they find** — the course rubric specifically distinguishes "scanning performed" from "vulnerabilities fixed," and only the latter earns full marks.
- **Storage security:** receipt images in Supabase Storage are private by default, accessed only via short-lived signed URLs generated server-side for the owning user.
- **Cron endpoint security:** the recurring-transactions route must reject any request that doesn't present the correct `CRON_SECRET`, so it can't be triggered by an arbitrary public request.

---

## 10. Performance Optimization

⚠️ MANDATORY: implement and **measure, with before/after numbers**, at least three optimizations on the client and at least two on the server (the course rubric explicitly wants quantified impact, not anecdotal improvement). Candidates — 💡 research which are highest-impact for this specific app before committing:

- Client: image optimization for receipt thumbnails/avatars, code-splitting/dynamic imports for heavy panels (Receipt Editor, Analytics charts) that aren't needed on first paint, memoization of expensive derived calculations (e.g., per-person split totals recalculating on every keystroke).
- Server: database indexing on frequently filtered columns (`user_id`, `occurred_on`, `group_id`), pagination instead of full-table fetches, connection pooling (Supabase provides this — confirm it's configured, not assumed), caching of Analytics aggregates that don't need to be recomputed on every request.
- Measure with Lighthouse/Core Web Vitals for the client side and response-time logging for the server side; keep the before/after numbers, they're required evidence, not optional polish.

---

## 11. Error Handling & Logging

⚠️ MANDATORY, aligned with the course rubric's Error Handling & Logging criterion:

- Every user-facing error is **specific and actionable** — no raw error codes, no "Something went wrong" with no next step. Follow the tone already established in the prototype: explain what happened and how to fix it, in the interface's own voice, never apologetic, never vague.
- Retry/recovery paths for anything transient (a failed AI call retries once automatically before surfacing a manual-entry fallback; a failed save shows a retry action, not just a dead end).
- Structured logging (not just `console.log`) for every server-side error, with enough context (user id, route, timestamp, and for AI routes, which kill-switch state was in effect) to actually debug an incident after the fact — this directly supports the kill-switch contract's requirement to log why a feature was off.
- Sentry (or equivalent) wired up in production so errors are visible without needing to reproduce them manually.
- The app must never hard-crash to a white screen — every route has a proper error boundary with a recovery action.

---

## 12. Testing

💡 RESEARCH & IMPROVE the exact tooling, but coverage of the following is ⚠️ MANDATORY:

- Unit tests for every business-logic function in §6 (split math, budget rollover, recurring-transaction idempotency) — property-based/randomized inputs specifically for the split-math invariant (§6.2's "sums must reconcile exactly").
- Integration tests for the API routes in §8, including auth-rejection cases (a request without a valid session, a request for another user's data).
- The full AI kill-switch test suite specified in §4.5.
- At least one end-to-end test per persona scenario in §2 (Maya's receipt-import-and-split flow, Daniel's itemised-restaurant-split flow), run with AI both on and off, since both scenarios must degrade gracefully rather than break when AI is off.
- CI (GitHub Actions or equivalent) running lint, type-check, and the full test suite on every pull request before merge — this is what "fully automatically managed" should mean for your own development workflow too, not just for hosting.

---

## 13. Deployment & Hosting

⚠️ MANDATORY sequence (💡 research the exact current dashboard steps for whichever provider version is current at build time):

1. Create the Supabase project; apply migrations for the schema in §5; enable RLS and apply all policies before any real data touches the tables.
2. Set up Supabase Auth providers (email/password, Google OAuth).
3. Create the Vercel project, link the GitHub repo, configure automatic deploys on push to the main branch and preview deploys per pull request.
4. Set every environment variable from §4.1 in the Vercel dashboard (production, and separately for preview if you want preview deploys to have AI on/off differently — a reasonable use of the granular switches for a staging environment).
5. Configure the Vercel Cron Job for the recurring-transactions route, with `CRON_SECRET` set.
6. Attach the custom domain in Vercel's domain settings, and point the DNS record at your registrar per Vercel's instructions.
7. Confirm HTTPS is enforced (Vercel does this automatically) and that no `NEXT_PUBLIC_*` variable accidentally contains a secret.
8. Run the full test suite (§12) against the deployed preview URL before promoting to production.

At no point in this sequence should you provision a virtual machine, write a Dockerfile for application hosting, or configure a reverse proxy. If you find yourself doing any of those, stop — you've drifted from the "no servers" constraint.

---

## 14. Source Control & Documentation

⚠️ MANDATORY, aligned with the course rubric's Source Control and Documentation criterion:

- Meaningful, incremental commit history (not one giant commit at the end).
- A comprehensive `README.md` with: setup instructions (including exactly which environment variables are required vs. optional, cross-referencing §4.1), usage instructions, API documentation (or a link to it), and the live deployed URL.
- `DECISIONS.md` (see §15) checked into the repo, not left as a scratch file — it's part of the documentation deliverable, and it's also exactly the artifact that lets a human reviewer see where you researched, deviated from a default, and why.

---

## 15. Research & Continuous Improvement Mandate

This is not a document to implement literally and mechanically. You are expected to actively research, question defaults, and improve on them — within the boundaries §1 sets.

**Before implementing each major module**, do a short, targeted research pass. Don't just pattern-match to training data for fast-moving ecosystem topics — actually search. Example queries worth running (adapt to whatever module you're on):
- "Next.js App Router Supabase Row Level Security best practices [current year]"
- "Supabase RLS performance recursive policy SECURITY DEFINER"
- "Vercel Cron Jobs current limits [plan tier]"
- "Claude API current model recommendations for classification tasks"
- "serverless rate limiting Upstash Redis Next.js pattern"

**Keep a `DECISIONS.md` log.** For every place this guide says 💡 RESEARCH & IMPROVE, and for anything not covered by this guide at all, write a short entry: what you considered, what you chose, and why. This is not busywork — it's what turns "an AI built this" into "an AI made defensible engineering decisions," which is a very different and much stronger thing.

**Self-critique before moving on.** After finishing each module, hold it up against §16's rubric-alignment table and §17's acceptance checklist. Identify the gap between what you built and the top tier of each relevant rubric row. Iterate at least once before considering the module done. Grade yourself against the "Exceptional" column, not the "Acceptable" column — the acceptable column is a floor, not a target.

**You are explicitly encouraged to propose things beyond this spec**, as long as they never violate §1's five non-negotiables. If you see a way to make Maya's or Daniel's scenario meaningfully better — faster, clearer, more delightful — pursue it, and note it in `DECISIONS.md` so it's visible as a deliberate enhancement rather than scope creep.

**When you're not sure whether an idea is a good one, ask which choice best serves user trust in a finance app.** That single question resolves most of the close calls in a product like this.

---

## 16. Rubric Alignment Map

This maps directly to the course's final marking rubric, so you can self-assess against exactly what will be graded. Weight is shown as it appears on the rubric (out of 130 total).

| Rubric criterion | Weight | Where this guide addresses it |
|---|---|---|
| UX Design Compliance | /10 | §2 (persona scenarios), §7 (feature specs reference specific heuristic fixes), the original report's screen-by-screen UX rationale |
| Front-end Framework Concepts | /10 | §3 (Next.js/React architecture), component structure and state management are yours to design well — this is an area to actively demonstrate strength, not just satisfy minimally |
| App Features & Completeness | /20 (heaviest single criterion) | §7's exhaustive feature list — treat every row as a checklist item |
| Back-end & Data Persistence | /10 | §5 (schema), §8 (API contract), §3 (Supabase as managed Postgres) |
| Security Mechanisms | /10 | §9, plus §4's kill-switch security requirements |
| Performance Optimization | /10 | §10 — remember, quantified before/after is required for top marks, not just implementation |
| Error Handling & Logging | /10 | §11 |
| Presentation & Demo | /15 | Not directly covered by this build guide — plan a live-demo walkthrough of Maya's and Daniel's scenarios specifically, since they're the most compelling and complete stories the product tells |
| Q/A Handling | /10 | Know *why* every decision in `DECISIONS.md` was made — that document is your best defense in a Q&A |
| Source Control and Documentation | /10 | §14 |
| Final Report – Writing and Organization | /15 | Not covered here — a separate writing deliverable, but §15's `DECISIONS.md` is excellent raw material for it |

---

## 17. Acceptance Criteria / Definition of Done

A build is not complete until every item below is true. This is the checklist to run before calling anything "done."

**Kill switch**
- [ ] All resolution-algorithm branches (§4.2) are covered by automated tests, including the spend-cap auto-disable.
- [ ] With the master switch off, all three AI entry points are absent from the DOM (not disabled — absent), and zero outbound calls are made to either AI provider, proven by tests, not just observation.
- [ ] Each per-feature switch works independently of the others while the master is on.
- [ ] Every AI-calling route returns the standardized `{ "enabled": false, "reason": "..." }` envelope with HTTP 200 when off.

**Core mechanic**
- [ ] Confirming a group expense split immediately creates the correct personal-ledger transaction(s) for every participant, with no manual step, and this works identically with AI on or off.

**Math correctness**
- [ ] All four split modes produce per-person shares that sum exactly to the total, verified by property-based tests across randomized inputs.
- [ ] Budget rollover follows the exact rule in §6.3.

**Security**
- [ ] RLS is enabled on every table; a cross-user data-access attempt is verified (not assumed) to fail at the database layer.
- [ ] No secret key appears in any client-bundled code — verified by inspecting the built output, not just the source.
- [ ] A SAST and a DAST scan have been run, and their findings addressed, not just logged.

**No-servers hosting**
- [ ] The entire app deploys and runs with zero self-managed servers — no VM, no Docker host, no SSH access anywhere in the stack.
- [ ] A push to the main branch results in an automatic production deploy with no manual step.

**Personas**
- [ ] Maya's full scenario (§2) works end-to-end, start to finish, in under roughly 90 seconds of interaction.
- [ ] Daniel's full scenario (§2) works end-to-end, including generating a shareable breakdown before confirming.

**Documentation**
- [ ] `README.md` and `DECISIONS.md` are both complete and checked into the repo.

---

## 18. Suggested Build Order

This order is deliberate: it builds the entire non-AI product first and proves it's fully functional on its own, which makes "AI off doesn't break anything" true by construction rather than something bolted on and hoped for at the end.

1. Project scaffolding: Supabase project, Vercel project, environment variables, Auth wired up.
2. Full schema (§5) + RLS policies, tested with two separate test accounts to prove isolation.
3. Personal Ledger — full CRUD, manual entry only, no AI wired up yet at all.
4. Split Studio core — groups, invites, equal and exact split modes.
5. Receipt Editor — itemised mode, manual line-item entry, tax/tip allocation math (§6.2).
6. Weighted split mode.
7. Analytics Hub — all KPIs and charts, no AI narrative yet.
8. Settings, empty states, error-handling framework, toasts/confirmations.
9. Recurring transactions + the cron job (§6.5) — still zero AI.
10. **Now** add the AI integration layer behind the full kill-switch contract (§4): categorization, OCR, narrative — each one built and tested for its on/off behavior before moving to the next.
11. Security hardening pass: SAST/DAST, RLS penetration testing, secret-exposure audit.
12. Performance pass with measured before/after numbers.
13. Full test suite + CI.
14. Deployment, custom domain, README/DECISIONS.md finalization.
15. Self-critique pass against §16 and §17 — iterate on any gap before declaring done.

---

## 19. Appendix

**Glossary**
- **Kill switch** — the `AI_FEATURES_ENABLED` master flag and its per-feature children, §4.
- **Auto-flow** — the core mechanic where a confirmed group-expense share becomes a personal-ledger transaction with no manual step.
- **Settle Up** — a bookkeeping action only; no real money moves through LEDGR itself.
- **Maya / Daniel** — the two personas from the original report; every feature should be checked against whether it makes their specific scenarios (§2) better or worse.

**Reference links worth starting from (verify currency before relying on any of them):**
- Next.js documentation: https://nextjs.org/docs
- Supabase documentation: https://supabase.com/docs
- Supabase Row Level Security guide: https://supabase.com/docs/guides/database/postgres/row-level-security
- Vercel Cron Jobs documentation: https://vercel.com/docs/cron-jobs
- Claude API documentation: https://docs.claude.com/en/api/overview
- Google Cloud Vision documentation: https://cloud.google.com/vision/docs
