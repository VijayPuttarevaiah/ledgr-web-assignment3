/**
 * Assignment 3 — load-test dataset.
 *
 * `npm run seed:demo` produces a *presentation* dataset (88 transactions)
 * sized to make the screens look right, not to stress the server. Load
 * testing that dataset would measure almost nothing: every "fetch all of
 * this user's transactions" query returns in well under a millisecond at
 * that size, so the queries that actually scale badly would look free and
 * the optimisations in §2 would have nothing to improve.
 *
 * This script tops the primary demo account up to a realistic
 * heavy-user history — 4,000 transactions spread over 36 months, roughly
 * 3.7 entries a day — which is the volume the JMeter plan runs against for
 * both the baseline and the optimised measurements. The dataset is
 * deterministic (fixed PRNG seed), so the "before" and "after" runs are
 * measured against byte-identical data.
 *
 * Usage: npm run seed:loadtest
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { addDays, format, subMonths } from "date-fns";

function loadEnvLocal() {
  const path = resolve(__dirname, "..", "..", ".env.local");
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run `supabase start` first).");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAIL = "demo@ledgr.app";
const TARGET_ROWS = 4_000;
const MONTHS_OF_HISTORY = 36;

/** Mulberry32 — a tiny seeded PRNG so every run produces identical data. */
function makeRandom(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MERCHANTS: Array<{ description: string; category: string; min: number; max: number }> = [
  { description: "Sobeys", category: "Groceries", min: 1800, max: 14500 },
  { description: "Superstore", category: "Groceries", min: 2400, max: 19000 },
  { description: "Tim Hortons", category: "Dining", min: 350, max: 2200 },
  { description: "Uber Eats", category: "Dining", min: 1800, max: 6500 },
  { description: "Halifax Transit", category: "Transport", min: 275, max: 900 },
  { description: "Irving Oil", category: "Transport", min: 4000, max: 11000 },
  { description: "Nova Scotia Power", category: "Utilities", min: 6000, max: 18000 },
  { description: "Eastlink Internet", category: "Utilities", min: 7500, max: 9500 },
  { description: "Netflix", category: "Entertainment", min: 1699, max: 2299 },
  { description: "Cineplex", category: "Entertainment", min: 1400, max: 4800 },
  { description: "Shoppers Drug Mart", category: "Health", min: 900, max: 8500 },
  { description: "Amazon.ca", category: "Shopping", min: 1200, max: 22000 },
];

const PAYMENT_METHODS = ["card", "cash", "transfer"] as const;

async function main() {
  const { data: userList, error: userError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (userError) throw userError;
  const demoUser = userList.users.find((u) => u.email === DEMO_EMAIL);
  if (!demoUser) {
    throw new Error(`Demo user ${DEMO_EMAIL} not found — run \`npm run seed:demo\` first.`);
  }
  console.log(`Load-test target: ${DEMO_EMAIL} (${demoUser.id})`);

  const { data: categories, error: catError } = await admin
    .from("categories")
    .select("id, name")
    .or(`user_id.eq.${demoUser.id},user_id.is.null`);
  if (catError) throw catError;
  const categoryIdByName = new Map((categories ?? []).map((c) => [c.name, c.id]));

  // Only the synthetic rows are cleared, never the curated demo rows the
  // screenshots rely on — they are tagged with a distinctive prefix.
  const TAG = "[loadtest]";
  const { count: existing } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", demoUser.id)
    .like("description", `${TAG}%`);
  if ((existing ?? 0) > 0) {
    console.log(`Clearing ${existing} previously seeded load-test rows...`);
    await admin.from("transactions").delete().eq("user_id", demoUser.id).like("description", `${TAG}%`);
  }

  const random = makeRandom(20260726);
  const start = subMonths(new Date(), MONTHS_OF_HISTORY);
  const spanDays = MONTHS_OF_HISTORY * 30;

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < TARGET_ROWS; i += 1) {
    // Every 14th row is income so the income/expense aggregate the summary
    // endpoint computes has both sides to add up.
    const isIncome = i % 14 === 0;
    const dayOffset = Math.floor(random() * spanDays);
    const occurredOn = format(addDays(start, dayOffset), "yyyy-MM-dd");

    if (isIncome) {
      rows.push({
        user_id: demoUser.id,
        type: "income",
        amount_cents: 180_000 + Math.floor(random() * 40_000),
        description: `${TAG} Payroll deposit`,
        category_id: categoryIdByName.get("Income") ?? null,
        payment_method: "transfer",
        occurred_on: occurredOn,
        is_recurring: false,
      });
      continue;
    }

    const merchant = MERCHANTS[Math.floor(random() * MERCHANTS.length)];
    rows.push({
      user_id: demoUser.id,
      type: "expense",
      amount_cents: merchant.min + Math.floor(random() * (merchant.max - merchant.min)),
      description: `${TAG} ${merchant.description}`,
      category_id: categoryIdByName.get(merchant.category) ?? null,
      payment_method: PAYMENT_METHODS[Math.floor(random() * PAYMENT_METHODS.length)],
      occurred_on: occurredOn,
      is_recurring: false,
    });
  }

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await admin.from("transactions").insert(chunk);
    if (error) throw error;
    process.stdout.write(`\r  Inserted ${Math.min(i + CHUNK, rows.length)}/${rows.length} rows...`);
  }
  process.stdout.write("\n");

  const { count: total } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", demoUser.id);

  console.log(`Done. ${DEMO_EMAIL} now has ${total} transactions spanning ${MONTHS_OF_HISTORY} months.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
