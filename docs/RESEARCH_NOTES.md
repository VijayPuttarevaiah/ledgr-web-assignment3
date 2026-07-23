# LEDGR — Research Notes (Assignment 1 Report + Heuristic Evaluations)

Source files:
- `LEDGR_Assignment1_Report.pdf` (Het Soni, CSCI 4177/5709, Dalhousie University)
- `LEDGR_Evaluations/LEDGR_Evaluation_E1.docx` – `E5.docx` (evaluators: E1 Rohan Macwan, E2 Divyaxi Rawat, E3 Vishwa Pravin, E4 Jashwanth Pantra Chittibabu, E5 Rajeev Radhakrishnan — all Group 5, dated July 22, 2026)
- `ledger-prototype-old.pdf` (rendering of the pre-fix prototype)

Compiled as reference for an engineer; not for prose reading. Deduplicated, factual, bullet form.

---

## 1. Personas

### 1.1 Maya — solo budgeter

| Field | Detail |
|---|---|
| Age | 26 |
| Occupation | MSc Computer Science student, Dalhousie University |
| Location | Halifax, NS, Canada |
| Technical proficiency | High — uses Git, VS Code, and several web apps daily |
| Living situation | Shares a 3-bedroom apartment with two other grad students |
| Income | TA stipend $1,400/month + tutoring ~$600/month |

**Biography**: Moved to Halifax from Toronto 8 months ago. Fixed income, significant tuition, tracks spending carefully. Built a personal budgeting spreadsheet in week one, still maintained but now unwieldy. Roommates split groceries, streaming, utilities monthly. Uses Splitwise for group balances and her spreadsheet for personal budget — the two never talk to each other. Forgets to update one or the other most months; end-of-month totals end up wrong.

**Goals**:
- See true monthly spending (incl. her share of shared expenses) with zero manual reconciliation step.
- Stay within self-defined budget categories, with a **visible warning before** going over, not after.
- Minimize time on data entry — wants logging a $4.50 coffee to be faster than opening a spreadsheet.

**Frustrations** (exact figures from report):
- Spreadsheet says $340 spent on food this month; real number is closer to $420 once her 1/3 share of a shared Costco run is included — she only found this by doing the math manually once.
- Splitwise group balances are accurate but completely disconnected from her personal budget categories.
- Small purchases (e.g., coffee) rarely logged because opening a spreadsheet for a $4.50 transaction has too much friction.

**What she wants in an app**:
- Automatic integration of shared expenses into personal ledger the instant a split is recorded — no copy-paste.
- Fast entry: **under five seconds** for a typical transaction; option to photograph a receipt.
- A dashboard checkable in **ten seconds** that shows monthly standing without opening a spreadsheet.

**Benchmark Scenario — Personal Ledger + AI Receipt Import** (exact numbers matter):
- Costco run: $215.60 total, split 3 ways among roommates.
- Clicks **+ New entry** in top nav → side panel slides in from right, ledger stays visible behind it.
- Uploads receipt photo. **Within 2 seconds**, panel auto-populates: merchant name, date, total amount, **14 detected line items**.
- Claude suggests category "Groceries" at **96% confidence**; she taps accept, saves.
- Switches to Split Studio → Apartment 4B group → adds as shared expense → itemised editor assigns line items per roommate → confirms split.
- LEDGR immediately adds her share (**$72.40**) to personal ledger under Groceries; Analytics Hub Groceries progress bar reflects it immediately.
- **Total elapsed time: ~90 seconds, no double entry.** (This is the headline benchmark number — "under 90 seconds" for the full receipt-to-split-to-analytics flow.)

### 1.2 Daniel — group trip organiser

| Field | Detail |
|---|---|
| Age | 31 |
| Occupation | Project manager, Halifax-based engineering firm |
| Location | Halifax, NS, Canada |
| Technical proficiency | Moderate — comfortable with web apps, avoids command-line tools |
| Living situation | Lives with partner; regularly organises group trips/outings for a friend group of six |
| Income | $78,000/year |

**Biography**: Default trip/dinner/logistics organiser for his friend group. Dreads the end-of-trip financial reconciliation. On a 5-day Montreal trip he kept a running list in a shared Google Doc, came home to a mess of Interac transfers with vague descriptions, spent **two evenings** untangling who owed what. Two friendships got briefly tense over a **$40 discrepancy** nobody could trace. Has tried Splitwise but finds split calculation too rigid for restaurant bills with very different per-person orders.

**Goals**:
- Record shared expenses as they happen (not reconstructed from fuzzy memory later).
- Split restaurant bills by exact item (so a $38 steak orderer pays more than a $9 salad orderer) without manual arithmetic.
- Have a clear, shareable record at the end so participants can verify the calculation before money moves.

**Frustrations**:
- Equal splits feel unfair given different spending habits, but hand-calculating itemised splits mid-dinner is too tedious — so he usually gives up and does equal division anyway.
- Once a trip ends and balances settle, all detail disappears — no record of what was actually spent.
- Tax/tip allocation is a recurring point of contention (equal vs. proportional-to-subtotal); most apps force one choice with no flexibility.

**What he wants in an app**:
- Itemised receipt editor: each line item assignable to specific participants, with configurable tax/tip allocation method agreed before confirming.
- A PDF or shareable link of the final breakdown to send to the group so the calculation is transparent (nobody has to "take his word for it").
- A running group balance visible throughout the trip, not just after final settlement.

**Benchmark Scenario — Split Studio Receipt Editor** (exact numbers):
- Last night of Italy trip, 4 friends, restaurant bill = **$67.20**.
- Opens LEDGR on phone → Split Studio → "Italy Trip 2026" group → taps **+ Add Expense**.
- Uploads bill photo; Cloud Vision extracts line items in **~3 seconds**.
- Receipt Editor: taps avatar circles per line item to assign participants (both pizzas → the 2 people who ordered them; garlic bread & drinks → split across all 4).
- Tax: selects **Proportional** (each pays HST on own subtotal). Tip: group agrees verbally on **15%, split evenly**.
- Per-person breakdown at bottom updates live as assignments are made.
- Taps **Generate PDF**, sends receipt link to group chat for verification before money changes hands, then taps **Confirm Split**.
- Group's running balance updates, settlement amounts appear per person. "Nobody argues about the math."

---

## 2. Original 8 Prototype Screens — UX Rationale

Report text says "nine screens" total in the intro but only 8 are documented with numbered UX rationale (Screens 01–08); treat 8 as the enumerated/documented set. Built in Figma, connected with Smart Animate prototype links.

### Screen 01 — Login / Sign Up
- Split two-panel layout. Left panel: pure large typography — product name at **96pt**, three-line tagline — deliberately no hero illustration/marketing copy.
- Right panel: email/password fields, Google OAuth button, sign-up link.
- Prototype **intentionally includes a visible error state**: coral-bordered alert strip reading **"Invalid credentials. Please try again."** — included to demonstrate error surfacing, not just the happy path.
- **Error Prevention**: email field gets an amber underline when active (signals live validation before submission); error strip appears only after a failed submit attempt, not while typing (avoids false error signals mid-input).
- **Feedback**: error strip appears immediately with a left-side accent border to draw the eye before the message text is read. Password field does **not** clear on failure so the user can fix just the offending field.

### Screen 02 — Dashboard
- **Bento grid** layout — tiles of varying size create hierarchy without headers/section labels. Largest tile (spans 2 columns) = net worth, establishing the single most important number at a glance.
- Other tiles: monthly spending w/ progress bar, money owed to user w/ settle-up button, budget health per category w/ progress bars, 6-month spending trend chart, category breakdown, recent transactions list. Full-width settlements strip runs across the bottom.
- Explicitly called out as "the most structurally unconventional element of the design" — avoids equal-sized card grids common in finance apps; hierarchy via tile size, not colour/decoration.
- **Visibility of System Status**: net worth, spending, owed, budget health all visible pre-interaction — user knows their position the instant the page loads.
- **Recognition Over Recall**: category-breakdown and trend-chart colour assignments are consistent throughout the app — learned once, reused everywhere.
- **Aesthetic and Minimalist Design**: each bento tile answers exactly one question; no decorative illustration/explanatory text; hierarchy from size/position alone.

### Screen 03 — Personal Ledger
- Full transaction table with inline filter tabs: **All, Income, Expenses, Recurring, Shared**.
- Summary strip directly below command bar: total income, total expenses, net balance, transaction count for selected period, in large type — shown before individual rows.
- Each row has an **Edit** link. Categories = small colour-coded pills, same colour system as dashboard. Amounts: **jade green for income, coral red for expenses**, consistently throughout.
- Pagination controls at bottom (not infinite scroll).
- **User Control and Freedom**: every row editable at any time; pagination lets user move through history without being locked into infinite scroll.
- **Aesthetic and Minimalist Design**: colour restricted to two places — amount column and category pills; rest of row is monochrome. Zebra striping uses very low opacity to stay subtle.

### Screen 04 — New Entry (Side Panel)
- **Deliberately not a centred modal** — slides in as a right-side panel, keeping the ledger visible behind it at reduced opacity. Preserves context (user can see already-logged transactions while entering a new one), which reduces duplicate entries.
- Amount field is intentionally large — **36pt type** — so the user can see what they're typing without losing focus from the centre of the form.
- Category field shows an inline **AI badge** when Claude returns a categorisation suggestion, with confidence percentage next to it.
- **Flexibility and Efficiency of Use**: receipt upload auto-populates all fields in **under 2 seconds**; manual-entry users fill field by field; the side-panel design supports both flows without either disrupting the other.
- **AI Assistance**: suggestion badge shows matched category + confidence score next to the category input; one-click accept or ignore/type-own — "offered, not imposed."
- **Error Prevention**: required fields marked with asterisk. Expense/Income toggle uses red/green colouring so a user can't accidentally log income as expense without a visible signal.

### Screen 05 — Split Studio
- Two-panel layout: group list (left), selected group's expense detail (right).
- Detail panel opens with a **balance summary strip** always showing current who-owes-whom state for the group.
- Below: expense table — columns for expense name, paid by, split mode, total, current user's share.
- Each expense row has a **coloured left border** for scannability without reading the row label first. Split modes shown as small **teal pills**.
- **Visibility of System Status**: balance summary always visible, updates immediately after any change — no separate calculation needed.
- **Match Between System and Real World**: table structured the way a shared bill is discussed in conversation (who paid / how divided / total / what user owes) — mirrors existing mental model.
- **Flexibility and Efficiency of Use**: 4 split modes per expense — equal division, itemised assignment, exact amounts, weighted shares. Each expense in a group can use a *different* mode (a 10-expense trip can mix methods).

### Screen 06 — Receipt Editor
- Full-canvas panel (not a small modal) — matches the scale of the task.
- Line items in a table; each item has an **Assigned To** column with coloured avatar circles (one per participant); tapping an avatar assigns that person. Multiple people can share one item.
- Below item table: tax/tip section — **proportional or equal allocation**, chosen independently for each; per-person breakdown at bottom updates in real time.
- **Generate PDF** button produces a shareable receipt sendable to all participants before the split is confirmed.
- **Direct Manipulation**: assignment via tapping avatar circles next to items — no dropdown/dialog; per-person total updates immediately so consequence of each tap is visible pre-confirmation.
- **Flexibility and Efficiency of Use**: tax/tip allocation mode set **per split, not globally** — directly targets the tip-scaling disagreement (proportional to order vs. equal split) without manual arithmetic.

### Screen 07 — Analytics Hub
- Opens with time-range strip: **1D, 1W, 1M, 3M, 1Y, All**.
- Five KPI tiles: spending total, income, savings rate, shared expense proportion, budget adherence, for selected period.
- Below: cash flow chart (income vs expenses, day by day), category breakdown (proportional bar charts), budget vs. actual comparison (progress bars).
- **AI narrative card** (lower section): three-sentence plain-language Claude-generated summary of the period, from the user's own data — includes a specific observation on which budget categories are over/under target plus a practical suggestion.
- **Visibility of System Status**: KPI strip answers 5 financial-health questions before any chart interaction; savings rate, budget adherence, shared-expense proportion computed and shown on load, not behind a drill-down.
- **Feedback**: budget-vs-actual progress bars turn **coral red** as soon as a category exceeds target; the same over-budget category is also named in the AI narrative card — same signal at two levels of detail on one screen.
- **Help and Documentation**: AI narrative card is "the only place in the app where the system tells the user what to do with the data," rather than just displaying it.

### Screen 08 — Settings
- Secondary left sidebar within the main content area: **Profile, Preferences, Notifications, Integrations, Danger Zone**.
- Notification settings use toggle switches; Profile/Preferences fields in a two-column form.
- Both **Discard** and **Save Changes** buttons visible at bottom-right at all times — clear exit path without committing unintended changes.
- **User Control and Freedom**: Discard button is the same size as Save Changes, always visible alongside it. Settings are **not auto-saved on change** — user edits, then explicitly saves or discards.
- **Consistency and Standards**: toggle switches follow the same on/off visual pattern as the AI Features screen — jade green = on, border-grey = off, consistent across both screens (learn once).

---

## 3. Heuristic Evaluation Findings (Consolidated Across E1–E5)

Legend: **[N× independent]** = flagged separately by N different evaluators (stronger signal). All 5 evaluations use the same 10-heuristic template (Nielsen's heuristics) even though only 8 distinct heuristic categories are named per evaluator (some evaluators note "not a primary concern for this lens" and defer to others — those are omitted below as non-findings).

### 3.1 Visibility of System Status
- **No loading/feedback state between action and result** — sign-in button gives no feedback between click and "Invalid credentials" appearing; "Save Transaction" has no spinner/confirmation toast either. *(E1)* → **Fix**: add loading state (spinner + disabled) to any button triggering a network round-trip, plus a success toast ("Transaction saved") after Save.
- **Receipt-scan / OCR has no visible progress indicator** despite promising "OCR + Claude auto-fill in <2s" — no way to tell scan is running/succeeded/failed. *(E2)* → **Fix**: determinate/indeterminate progress indicator during parsing + explicit success/failure state, not just fields silently appearing.
- **Password "show" toggle has no icon** — just low-contrast gray text label; no visible state change when toggled. *(E3)* → **Fix**: standard eye icon with clear on/off visual state.
- **Ledger pagination gives a raw count with no confirmation filters applied** — "Showing 1–10 of 143" doesn't visibly react when switching filter tabs. *(E4)* → **Fix**: update count/header dynamically, briefly highlight the change on filter apply.
- **AI Narrative card has no timestamp** — reads as generated commentary but doesn't say when it was last generated/refreshed, inconsistent with the Dashboard's "Updated just now" pattern. *(E5)* → **Fix**: add "Updated [time]" tag matching the Dashboard pattern.

### 3.2 Match Between System and the Real World
- **"LEDGR" listed as a payment method** in New Entry alongside Debit/Credit/e-Transfer — internal system concept, not a real-world payment method new users would recognize. *(E1)* → **Fix**: rename to something real-world, e.g. "Paid via split" or "In-app balance."
- **Budget Health shown as percentage only** ("Dining Out 109%") — forces user to do mental subtraction to know dollar amount over/under; dollars are the real unit people think in for money. *(E2)* → **Fix**: show dollar amount over/under alongside percentage, e.g. "109% — $18 over." *(Explicitly called out in the task brief as a must-address item — percentage vs. dollar amount display for budget over/under.)*
- **Split-mode labels use internal shorthand** — "Equal /4" and "Exact amt" instead of plain language. *(E3)* → **Fix**: full plain-language labels: "Split equally (4 people)," "Custom amounts."
- **Positive strength noted**: transaction descriptions use real, local, recognizable vendor names ("Sobeys — Weekly Groceries," "Halifax Transit Pass") — keep this pattern. *(E4)*
- **AI copy is vague** — "Cook 2x more to stay on track" has no baseline (2x what? relative to what week?). *(E5)* → **Fix**: rewrite AI copy to be concrete/specific — state the actual gap and a concrete suggestion.

### 3.3 User Control and Freedom
- **No way to reopen a confirmed split** — once a receipt split is confirmed in the Receipt Editor, "Confirm Split" reads as final with no visible edit path back. *(E1)* → **Fix**: allow reopening a confirmed split for a short window, or clearly label it as final before commit. *(Explicitly flagged in the task brief as a must-address item.)*
- **Danger Zone tab has no visible confirmation flow** guarding destructive actions (e.g., account deletion). *(E2)* → **Fix**: require typed confirmation (e.g., type "DELETE") plus a secondary confirm click for destructive actions.
- **Cancel button in Receipt Editor looks visually disabled** — same greyed treatment as a genuinely disabled button, ambiguous whether cancel is currently allowed. *(E3)* → **Fix**: give enabled/disabled states clearly distinct visual treatment (opacity + cursor + no hover response, only on true disabled). *(Explicitly flagged in task brief re: disabled/greyed-out buttons.)*
- **No bulk-select in the Ledger table** — editing category on multiple transactions requires opening each Edit link individually, up to 143 times in the worst case (based on the 143-row prototype dataset). *(E4)* → **Fix**: add multi-select with a bulk "change category" / "delete" action bar. *(Explicitly flagged in task brief re: missing bulk actions.)*
- **No way to dismiss/hide an individual AI narrative insight** the user finds unhelpful or repetitive. *(E5)* → **Fix**: add a per-insight dismiss control.

### 3.4 Consistency and Standards
- **Three different "active tab" visual styles** used across the app: underline (top nav), solid filled box ("All" in Ledger), left-border highlight (Split Studio group list). *(E1)* → **Fix**: standardize on one active-state pattern app-wide.
- **Colour semantics for money are inconsistent between screens (money in/out vs. debt direction)**: on the Ledger, red = expense / green = income (transaction-type meaning); on Split Studio, red = "you owe" / green = "owed to you" (debt-direction meaning). Same two colours, two different meanings, no legend anywhere. *(E2)* → **Fix**: pick one consistent colour mapping for "money leaving you" vs. "money owed to you" and keep it identical across every screen. *(Explicitly flagged in task brief re: color consistency for money in/out.)*
- **Primary-action colour breaks its own pattern** — gold is the primary-action colour everywhere (Continue, Save Transaction, +New entry) *except* "Settle Up," which is teal/green — breaks the "gold = primary action" convention the user just learned. *(E3)* → **Fix**: keep one consistent primary-button colour app-wide; reserve teal/green strictly for status/value indicators, not buttons.
- **Nav structure praised as a strength**: fixed top-level nav (Dashboard/Ledger/Split Studio/Analytics/AI) stays consistent across screens — good IA practice, preserve it. *(E4)*
- **Button copy inconsistent verb specificity**: "Save Transaction" (verb+noun) vs. "Save Changes" (Settings) vs. bare "Continue" (sign-in). *(E5)* → **Fix**: standardize on specific, active-voice labels matching what happens after ("Save transaction," "Save changes," "Sign in").

### 3.5 Error Prevention
- **No confirmation step before "Settle Up"** — an irreversible real-money action can be triggered by an accidental click. *(E1)* → **Fix**: require a confirm step, e.g. "Mark $45.00 as settled with Vijay?" *(Explicitly flagged in task brief re: confirmation dialogs for Settle Up.)*
- **Receipt Editor Coupon/Discount field has no validation against subtotal** — a discount exceeding the subtotal would produce a negative total, with no visible guard. *(E2)* → **Fix**: validate discount amount against subtotal before allowing confirm.
- **Low colour-contrast text** — gray helper text on near-black backgrounds, gray "show" label — risks failing WCAG contrast minimums for low-vision users, increasing misreads of financial data. *(E3)* → **Fix**: audit contrast ratios (aim for 4.5:1 body text minimum) across all screens, particularly helper/secondary text. *(Explicitly flagged in task brief re: color contrast on secondary text.)*
- **No error-prevention issue unique to this lens beyond confirmation dialogs**; defers to other evaluators' notes on confirmation dialogs for irreversible actions. *(E4)*
- **Nothing prevents duplicate entries** — a user could scan the same receipt twice or manually re-enter an already-existing transaction, with no duplicate-detection warning. *(E5)* → **Fix**: lightweight duplicate detection, e.g. "A similar transaction from today already exists — add anyway?"

### 3.6 Recognition Rather Than Recall
- **Avatar initials collide** — in the Receipt Editor, Vijay and Vatsal are both represented by the letter "V" in item-assignment bubbles, distinguished only by colour the first-time user hasn't memorized. *(E1)* → **Fix**: use two-letter initials (Vj / Vt) or show full names on hover, not colliding single letters.
- **AI confidence badge lacks explanation** — "AI: 94% match" on the Category field gives a confidence number with no explanation of what it's matched against. *(E2)* → **Fix**: one-line tooltip, e.g. "Matched based on your past Sobeys transactions."
- **Category colour-coding has no legend / colours repeat across unrelated categories** in the Ledger table. *(E3)* → **Fix**: consistent, limited colour palette per category with a legend, or drop colour-coding in favor of icon + label.
- **"Owed to you" figure lives in two disconnected places** — user must navigate to Split Studio to see debts, and separately to Dashboard to see "Owed to you," with no link between them. *(E4)* → **Fix**: make the Dashboard "Owed to you" card link directly into the relevant Split Studio group.
- **Positive strength noted**: description field pre-fills from OCR, reducing recall burden. *(E5)* → **Fix (extend, don't remove)**: keep pre-fill behavior; extend it to Category and Payment Method consistently.

### 3.7 Flexibility and Efficiency of Use
- **"Cmd K" shown with no explanation** of what it does or that it's discoverable to a novice. *(E1)* → **Fix**: add a subtle "search" affordance or tooltip.
- **"Recurring" filter tab exists but New Entry has no way to mark an entry as recurring / set up a recurring template** — the two features aren't connected. *(E2)* → **Fix**: add a "Make this recurring" toggle in New Entry that feeds the Recurring tab.
- **No visible keyboard-navigation affordance** in the New Entry modal (no visible focus states in the mockup) — matters for power users and accessibility. *(E3)* → **Fix**: ensure every interactive element has a visible focus ring and logical tab order.
- **No way to duplicate a recurring transaction** (e.g., "Netflix Monthly") from the Ledger instead of manual monthly re-entry, despite a "Recurring" tab existing. *(E4)* → **Fix**: add a "Duplicate" quick action per row, or genuine recurring-transaction automation.
- **No shortcuts reference beyond Cmd K** — power users would benefit from visible shortcuts for common actions like "new entry" or "next page." *(E4, additional note)* → **Fix**: add a shortcuts reference panel (e.g., "?" opens it).

### 3.8 Aesthetic and Minimalist Design
- **Dashboard shows 8 distinct data modules at once** (net worth, spending, owed-to-you, trend, category, budget health, recent, pending settlements) — first-time user dropped into a wall of numbers with no guided entry point. *(E1)* → **Fix**: lighter first-run state, or a visual hierarchy foregrounding 2–3 things with the rest explorable.
- **High simultaneous financial-figure count increases misread risk** (e.g., mistaking "owed to you" for "you owe"). *(E2)* → **Fix**: reduce simultaneous financial figures or increase visual separation between "money in" and "money out" groupings.
- **Analytics cash-flow chart has no axis labels or value callouts** — bars only, users must estimate dollar values from bar height alone. *(E3)* → **Fix**: add a light axis or on-hover value labels without cluttering the minimalist look.
- **Copy density on Dashboard is high** ("Updated just now," "+12% this month," "58% of income spent," etc.) — lots of small competing text labels. *(E5)* → **Fix**: tighten to essential label + number; move secondary context to hover/tooltip.

### 3.9 Help Users Recognize, Diagnose, and Recover from Errors
- **"Invalid credentials" offers no next step** — no "Forgot password?" link anywhere on the sign-in screen. *(E1)* → **Fix**: add password recovery directly beneath the error or the password field. *(Explicitly flagged in task brief re: forgot-password being missing.)*
- **No error state observable anywhere** for a failed save, failed OCR scan, or network drop — for money-handling software this is a significant gap. *(E2)* → **Fix**: design and test explicit failure states, not just the happy path, especially anything touching balances.
- **Only one error-banner style exists in the whole prototype** (sign-in's dark maroon banner + red text) — good pattern, but not reinforced anywhere else since it's the only error state shown. *(E3)* → **Fix**: reuse the same error-banner treatment consistently for every error across the app so it becomes a recognizable system pattern.
- **"Invalid credentials" gives no indication of remaining attempts or lockout risk.** *(E5)* → **Fix**: if a lockout policy exists, surface it after 2–3 failed attempts.

### 3.10 Help and Documentation
- **Zero "?" icons, tooltips, or documentation links across all 8 screens**, including for the AI-parsing feature which is genuinely novel and would benefit from a one-line explainer. *(E1)* → **Fix**: add lightweight contextual help, especially near AI-driven features.
- **No documentation near "Settle Up"**, which has real financial consequences (marks a debt as paid) and deserves at least a brief first-time explainer. *(E2)* → **Fix**: add a brief inline explainer the first time a user encounters Settle Up.
- **No visible way to search help content or FAQs** from anywhere in the product. *(E3)* → Noted as an acceptable known gap for a teaching prototype but should be tracked for the final project.
- **Positive strength noted**: the one piece of contextual help present ("OCR + Claude auto-fill in <2s") is a strong pattern — brief, in-context, sets expectation. *(E5)* → **Fix (extend)**: extend this short in-context helper-text style to other complex features (Settle Up, Itemised split mode) rather than building a separate help section.

### 3.11 Items specifically called out in the evaluation-review brief, cross-referenced
- **Disabled/greyed-out buttons**: Cancel button in Receipt Editor visually indistinguishable from a truly disabled button (E3, §3.3 above).
- **Colour consistency for money in/out**: red/green meaning flips between transaction-type (Ledger) and debt-direction (Split Studio) with no legend (E2, §3.4 above).
- **Budget over/under display — percentage vs. dollar amount**: Budget Health shows percentage only ("109%"), no dollar amount ("$18 over") (E2, §3.2 above).
- **Bulk actions missing**: no multi-select/bulk edit in the Ledger table, up to 143 individual Edit clicks in worst case (E4, §3.3 above).
- **Forgot-password missing**: no password-recovery link on the sign-in error/screen (E1, §3.9 above).
- **Confirmation dialogs for Settle Up**: no confirm step before this irreversible real-money action (E1, §3.5 above).
- **Reopening confirmed splits**: "Confirm Split" has no visible path to reopen/edit afterward (E1, §3.3 above).
- **Color contrast on secondary text**: gray helper text on near-black backgrounds risks failing WCAG 4.5:1 minimum (E3, §3.5 above).

---

## 4. Other Notable Details (not obviously covered by a standard build guide)

- **Report frames LEDGR's core differentiator explicitly**: "a user's share of any shared expense automatically flows into their personal ledger and analytics. There is no separate reconciliation step." Example given: a grocery run split three ways shows up as one-third of the cost under Groceries in the personal budget **the moment the split is recorded** — this exact framing/example may be worth preserving verbatim in product marketing copy or onboarding.
- **Four target user-group table** (from §1.3 of the report) beyond the two personas — useful for broader positioning:
  - Budget-conscious students & young professionals — lose the thread when shared costs enter the picture.
  - Flatmates/housemates — need a fair, persistent record for recurring shared costs (rent, utilities, groceries); Split Studio's running balance avoids end-of-month arguments.
  - Friend groups travelling together — trips produce dozens of shared expenses in a short window; itemised receipt editor + group ledger give a durable record even weeks later.
  - Couples managing joint and personal finances — need both shared and personal expenses handled without conflating them; each partner sees their own analytics separately.
- **Exact prototype dataset numbers** referenced by evaluators and worth using as realistic seed/test data: 143 total transactions in the Ledger ("Showing 1–10 of 143"); $4,280.50 net worth; $1,847 June spending against $3,200 income (58%); $340 owed across 3 open splits; 6-month spending trend values $1.2k/$1.5k/$1.0k/$1.8k/$1.3k/$1.8k; category breakdown Housing 35% / Food 24% / Transport 12% / Entertainment 8% / Other 21%; Budget Health Groceries 85%, Dining Out 109% (OVER), Transport 63%, Entertainment 60%; Analytics KPIs Spending $1,847 (down 8%), Income $4,000 (stable), Savings Rate 42.1% (up 5pp), Shared $342 (18.5% of total), Budget 88% (4 categories healthy).
- **Specific AI narrative copy shown in the prototype** (useful as tone reference, and also the exact text E5 criticized as vague): "You spent $1,847 this month — 8% less than May. Great progress." / "Dining Out is your only over-budget category (+$18). Cook 2x more to stay on track." / "Shared expenses ($342) are 18.5% of total. Savings rate 42.1% — your best in 6 months."
- **Exact receipt-editor arithmetic example** (Pizza Night, Jun 8, 2026, $67.20 total) usable as a worked test case for the split-calculation engine: Pepperoni Pizza (Lg) $22.99 → You+Jake; Veggie Pizza (Md) $18.99 → Vijay+Vatsal (shown as V/V, ambiguous per E1's finding); Garlic Bread x2 $4.49/ea → all four; Coca-Cola 2L x2 $3.49/ea → Jake+Vatsal; Dipping Sauce x3 $0.99/ea → You. Subtotal $60.92, Tax (HST 15%, proportional) +$9.14, Tip (15%) +$9.14, Coupon/Discount -$10.00, Total $67.20. Per-person: You $19.80, Vijay $14.60, Jake $20.90, Vatsal $11.90. **Note**: this worked example is a good regression-test fixture for the itemised-split + proportional-tax + equal-tip + flat-discount calculation.
- **Exact colour/typography specifics called out as deliberate design decisions** (not just aesthetic filler — the report treats them as UX decisions): login-screen product name at 96pt; New Entry amount field at 36pt; jade green for income / coral red for expenses on the Ledger; teal pills for split-mode labels on Split Studio; gold as the established primary-action colour (per E3's finding, broken only by the teal "Settle Up" button); amber underline for an active/validating form field.
- **The report's own citation list** (§4 References) includes Nielsen's 10 heuristics, NN/g on recognition/recall and direct manipulation, a bento-grid CSS tutorial, two fintech/UI-trend blog pieces, Figma's prototyping-connection docs, Google Cloud Vision docs, and Splitwise itself as a competitive reference — signals the design was explicitly benchmarked against Splitwise and current (2025/2026) fintech UI trends.
- **Old prototype rendering (`ledger-prototype-old.pdf`) confirms the literal screen content** the evaluators were reacting to, including exact copy strings such as "Updated just now," "OCR + Claude auto-fill in < 2s," "Every dollar. Every split. One place." (login tagline), and the exact Settings toggle list (Email Digests, Push Notifications, Settlement Reminders) — useful if reproducing/contrasting old vs. new screens directly.
- **Evaluator cross-referencing pattern**: E4 and E5 evaluations explicitly defer to each other and to E1/E2 on several heuristics ("Not a primary concern for this lens... See E1/E5 notes on Dashboard density," "See other evaluators' notes on confirmation dialogs for irreversible actions") rather than inventing new findings — meaning the deduplicated list above is close to exhaustive of what all 5 evaluators actually found; there is no large pool of additional unique findings hiding in the deferred-to notes.
