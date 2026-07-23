/**
 * Seeds a fully-populated demo account so every screen (Dashboard, Ledger,
 * Split Studio, Analytics, Settings) has realistic data to look at instead
 * of empty states.
 *
 * The accounts themselves are created through Supabase's real
 * authentication system (`auth.admin.createUser`) — genuine sign-ups with
 * real password hashes, not raw rows faked into the `profiles` table —
 * so they behave exactly like an account you created by hand and can sign
 * into normally. Everything *after* account creation (transactions,
 * budgets, group expenses) is seeded directly via the service-role client,
 * the same way `supabase/seed.sql` seeds system categories, because
 * clicking through the UI hundreds of times isn't a real workflow.
 *
 * Split-math for the group expenses reuses the exact same pure, unit-tested
 * functions the app itself calls (`src/lib/split-math.ts`) rather than
 * hand-computing numbers, so the seeded balances are guaranteed consistent
 * with what confirming the same expense in the UI would produce.
 *
 * Usage: npm run seed:demo
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { addDays, addMonths, format, startOfMonth, subMonths } from "date-fns";
import { splitEqual, splitItemised, allocateTaxTipDiscount } from "../src/lib/split-math";
import { computeRolloverCents } from "../src/lib/budget-rollover";

function loadEnvLocal() {
  const path = resolve(__dirname, "..", ".env.local");
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

const DEMO_PASSWORD = "DemoPass123!";
const TODAY = new Date();

interface DemoUser {
  email: string;
  fullName: string;
  id: string;
}

async function getOrCreateUser(email: string, fullName: string): Promise<DemoUser> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (!error) return { email, fullName, id: created.user.id };

  // Already exists from a previous run of this script — look it up instead.
  if (error.message.toLowerCase().includes("already been registered") || error.message.toLowerCase().includes("already exists")) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users.find((u) => u.email === email);
    if (existing) return { email, fullName, id: existing.id };
  }
  throw error;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[rand(0, arr.length - 1)];
}

async function categoryIdByName(name: string): Promise<string> {
  const { data } = await admin.from("categories").select("id").is("user_id", null).eq("name", name).single();
  if (!data) throw new Error(`System category "${name}" not found — did migrations + seed.sql run?`);
  return data.id;
}

async function main() {
  console.log("Creating demo accounts via Supabase Auth...");
  const maya = await getOrCreateUser("demo@ledgr.app", "Maya Chen");
  const jordan = await getOrCreateUser("demo.jordan@ledgr.app", "Jordan Lee");
  const sam = await getOrCreateUser("demo.sam@ledgr.app", "Sam Rivera");
  console.log(`  Maya (primary login):  ${maya.email}`);
  console.log(`  Jordan (roommate):      ${jordan.email}`);
  console.log(`  Sam (roommate):         ${sam.email}`);

  // getOrCreateUser is idempotent, but nothing below it was — re-running
  // this script duplicated transactions, budgets, and the demo group on
  // every run. Wipe this demo user's previously-seeded data first so the
  // script can be re-run safely, matching what the README already claims.
  console.log("Clearing any previously-seeded demo data...");
  const demoUserIds = [maya.id, jordan.id, sam.id];
  await admin.from("transactions").delete().in("user_id", demoUserIds);
  await admin.from("recurring_rules").delete().in("user_id", demoUserIds);
  await admin.from("budgets").delete().in("user_id", demoUserIds);
  await admin.from("groups").delete().eq("created_by", maya.id).eq("name", "Apartment 4B");

  const catIds = {
    groceries: await categoryIdByName("Groceries"),
    dining: await categoryIdByName("Dining"),
    transport: await categoryIdByName("Transport"),
    housing: await categoryIdByName("Housing"),
    entertainment: await categoryIdByName("Entertainment"),
    health: await categoryIdByName("Health"),
    education: await categoryIdByName("Education"),
    income: await categoryIdByName("Income"),
  };

  // ---------------------------------------------------------------------
  // Personal transactions for Maya — 4 months of realistic activity
  // ---------------------------------------------------------------------
  console.log("Seeding 4 months of personal transactions for Maya...");
  const monthsBack = 4;
  const rows: Record<string, unknown>[] = [];
  let recurringRuleId: string | null = null;

  for (let m = monthsBack - 1; m >= 0; m--) {
    const monthStart = startOfMonth(subMonths(TODAY, m));
    const isCurrentMonth = m === 0;
    const dayCap = isCurrentMonth ? TODAY.getDate() : 28;

    const on = (day: number) => format(addDays(monthStart, Math.min(day, dayCap) - 1), "yyyy-MM-dd");

    rows.push(
      { type: "income", amount_cents: 70000, description: "Salary Deposit — Dalhousie TA", category_id: catIds.income, occurred_on: on(1), payment_method: "Direct Deposit" },
      { type: "income", amount_cents: 70000, description: "Salary Deposit — Dalhousie TA", category_id: catIds.income, occurred_on: on(15), payment_method: "Direct Deposit" },
      { type: "income", amount_cents: rand(15000, 32000), description: "Tutoring — CSCI 1100", category_id: catIds.income, occurred_on: on(rand(8, 22)), payment_method: "e-Transfer" },
      { type: "expense", amount_cents: 85000, description: "Rent — Apartment 4B", category_id: catIds.housing, occurred_on: on(1), payment_method: "e-Transfer" },
      { type: "expense", amount_cents: 8250, description: "Halifax Transit Pass", category_id: catIds.transport, occurred_on: on(3), payment_method: "Credit" }
    );

    for (let i = 0; i < rand(4, 5); i++) {
      rows.push({
        type: "expense",
        amount_cents: rand(4500, 11000),
        description: pick(["Sobeys — Weekly Groceries", "Atlantic Superstore", "Pete's Fine Foods"]),
        category_id: catIds.groceries,
        occurred_on: on(rand(1, dayCap)),
        payment_method: "Debit",
      });
    }
    for (let i = 0; i < rand(7, 11); i++) {
      rows.push({
        type: "expense",
        amount_cents: rand(500, 3800),
        description: pick(["Tim Hortons", "The Port Pub", "Freeman's Little New York", "Pizza Corner", "Boston Pizza", "Subway"]),
        category_id: catIds.dining,
        occurred_on: on(rand(1, dayCap)),
        payment_method: pick(["Debit", "Credit"]),
      });
    }
    for (let i = 0; i < rand(1, 2); i++) {
      rows.push({
        type: "expense",
        amount_cents: rand(1200, 4500),
        description: pick(["Shoppers Drug Mart", "Lawtons Drugs"]),
        category_id: catIds.health,
        occurred_on: on(rand(1, dayCap)),
        payment_method: "Debit",
      });
    }
    rows.push({
      type: "expense",
      amount_cents: 1799,
      description: "Netflix Monthly",
      category_id: catIds.entertainment,
      occurred_on: on(9),
      payment_method: "Credit",
      is_recurring: true,
    });
    rows.push({
      type: "expense",
      amount_cents: 1199,
      description: "Spotify Premium",
      category_id: catIds.entertainment,
      occurred_on: on(6),
      payment_method: "Credit",
      is_recurring: true,
    });
    if (rand(0, 1)) {
      rows.push({
        type: "expense",
        amount_cents: rand(1500, 3200),
        description: "Cineplex Cinemas",
        category_id: catIds.entertainment,
        occurred_on: on(rand(1, dayCap)),
        payment_method: "Credit",
      });
    }
    if (m === monthsBack - 1) {
      rows.push({
        type: "expense",
        amount_cents: 12499,
        description: "Amazon — Textbooks",
        category_id: catIds.education,
        occurred_on: on(4),
        payment_method: "Credit",
      });
    }
  }

  // Bulk multi-row inserts go through PostgREST's json_to_recordset, which
  // fills any key missing from a given row's JSON with a literal NULL
  // rather than letting the column's DEFAULT apply — so every NOT NULL
  // column with a default needs to be explicit on every row here.
  for (const row of rows) {
    row.user_id = maya.id;
    if (row.is_recurring === undefined) row.is_recurring = false;
  }
  const { error: txError } = await admin.from("transactions").insert(rows);
  if (txError) throw txError;
  console.log(`  Inserted ${rows.length} transactions.`);

  // A live recurring rule, so Settings -> Preferences and the Recurring
  // filter both have something real to show.
  const { data: rule, error: ruleError } = await admin
    .from("recurring_rules")
    .insert({
      user_id: maya.id,
      type: "expense",
      amount_cents: 1799,
      description: "Netflix Monthly",
      category_id: catIds.entertainment,
      payment_method: "Credit",
      frequency: "monthly",
      next_run_on: format(addMonths(startOfMonth(TODAY), 1), "yyyy-MM-dd"),
      active: true,
    })
    .select("id")
    .single();
  if (ruleError) throw ruleError;
  recurringRuleId = rule.id;
  console.log(`  Created recurring rule ${recurringRuleId}.`);

  // ---------------------------------------------------------------------
  // Budgets — this month intentionally over on Dining, comfortably under
  // on Groceries/Transport; last month's Groceries underspend demonstrates
  // rollover actually working when you look at this month's effective budget.
  // ---------------------------------------------------------------------
  console.log("Seeding budgets (incl. a rollover example)...");
  const thisMonth = format(startOfMonth(TODAY), "yyyy-MM-dd");
  const lastMonth = format(startOfMonth(subMonths(TODAY, 1)), "yyyy-MM-dd");

  const lastMonthGroceriesBase = 40000;
  const lastMonthGroceriesSpend = 31200; // underspent -> rolls forward, capped at 50%
  const rollover = computeRolloverCents(lastMonthGroceriesBase, lastMonthGroceriesSpend);

  await admin.from("budgets").insert([
    { user_id: maya.id, category_id: catIds.groceries, month: lastMonth, base_amount_cents: lastMonthGroceriesBase, rollover_amount_cents: 0 },
    { user_id: maya.id, category_id: catIds.groceries, month: thisMonth, base_amount_cents: lastMonthGroceriesBase, rollover_amount_cents: rollover },
    { user_id: maya.id, category_id: catIds.dining, month: thisMonth, base_amount_cents: 20000, rollover_amount_cents: 0 },
    { user_id: maya.id, category_id: catIds.transport, month: thisMonth, base_amount_cents: 15000, rollover_amount_cents: 0 },
    { user_id: maya.id, category_id: catIds.entertainment, month: thisMonth, base_amount_cents: 6000, rollover_amount_cents: 0 },
  ]);
  console.log(`  Groceries rollover from last month: $${(rollover / 100).toFixed(2)}`);

  // ---------------------------------------------------------------------
  // Split Studio — "Apartment 4B" with all three demo accounts as members,
  // a mix of confirmed expenses (equal + itemised, with the auto-flow
  // manually reproduced exactly the way confirm_group_expense would),
  // one still in draft, and one partial settlement.
  // ---------------------------------------------------------------------
  console.log("Seeding Split Studio group + expenses...");
  const { data: group, error: groupError } = await admin
    .from("groups")
    .insert({ name: "Apartment 4B", created_by: maya.id })
    .select("id")
    .single();
  if (groupError) throw groupError;
  const groupId = group.id;

  await admin.from("group_members").insert([
    { group_id: groupId, user_id: maya.id, role: "owner" },
    { group_id: groupId, user_id: jordan.id, role: "member" },
    { group_id: groupId, user_id: sam.id, role: "member" },
  ]);

  async function confirmSeededExpense(params: {
    description: string;
    totalCents: number;
    paidBy: string;
    occurredOn: string;
    splitMode: "equal" | "itemised";
    shares: Record<string, number>;
    items?: { item_name: string; quantity: number; unit_price_cents: number; assignedUserIds: string[] }[];
    taxCents?: number;
    tipCents?: number;
  }) {
    const { data: expense, error } = await admin
      .from("group_expenses")
      .insert({
        group_id: groupId,
        description: params.description,
        total_amount_cents: params.totalCents,
        paid_by: params.paidBy,
        occurred_on: params.occurredOn,
        split_mode: params.splitMode,
        tax_amount_cents: params.taxCents ?? 0,
        tip_amount_cents: params.tipCents ?? 0,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        reopened_until: addDays(new Date(), 1).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;

    if (params.items) {
      for (const [i, item] of params.items.entries()) {
        const { data: itemRow, error: itemErr } = await admin
          .from("group_expense_items")
          .insert({
            group_expense_id: expense.id,
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price_cents: item.unit_price_cents,
            position: i,
          })
          .select("id")
          .single();
        if (itemErr) throw itemErr;
        await admin
          .from("group_expense_item_assignments")
          .insert(item.assignedUserIds.map((user_id) => ({ item_id: itemRow.id, user_id })));
      }
    }

    await admin
      .from("group_expense_shares")
      .insert(Object.entries(params.shares).map(([user_id, computed_share_cents]) => ({ group_expense_id: expense.id, user_id, computed_share_cents })));

    // Reproduce confirm_group_expense's auto-flow exactly: one transaction
    // per participant, tagged with source_group_expense_id.
    await admin.from("transactions").insert(
      Object.entries(params.shares)
        .filter(([, cents]) => cents > 0)
        .map(([user_id, amount_cents]) => ({
          user_id,
          type: "expense" as const,
          amount_cents,
          description: `Split: ${params.description}`,
          occurred_on: params.occurredOn,
          source_group_expense_id: expense.id,
          payment_method: "Paid via split",
          is_recurring: false,
        }))
    );

    return expense.id;
  }

  // 1. Rent — equal three ways, paid by Jordan.
  const rentShares = splitEqual(240000, [maya.id, jordan.id, sam.id], jordan.id);
  await confirmSeededExpense({
    description: "June Rent",
    totalCents: 240000,
    paidBy: jordan.id,
    occurredOn: format(startOfMonth(TODAY), "yyyy-MM-dd"),
    splitMode: "equal",
    shares: rentShares,
  });

  // 2. Costco grocery run — itemised, paid by Maya (Maya's persona scenario).
  const costcoItems = [
    { item_name: "Bulk Pantry Staples", quantity: 1, unit_price_cents: 8990, assignedUserIds: [maya.id, jordan.id, sam.id] },
    { item_name: "Fresh Produce Box", quantity: 1, unit_price_cents: 4520, assignedUserIds: [maya.id, jordan.id, sam.id] },
    { item_name: "Household Supplies", quantity: 1, unit_price_cents: 8050, assignedUserIds: [maya.id, jordan.id, sam.id] },
  ];
  const costcoSubtotals = splitItemised(
    costcoItems.map((it) => ({ id: it.item_name, lineTotalCents: it.quantity * it.unit_price_cents, assignedUserIds: it.assignedUserIds }))
  );
  const costcoTotal = costcoItems.reduce((a, it) => a + it.quantity * it.unit_price_cents, 0);
  await confirmSeededExpense({
    description: "Costco Run",
    totalCents: costcoTotal,
    paidBy: maya.id,
    occurredOn: format(addDays(startOfMonth(TODAY), 4), "yyyy-MM-dd"),
    splitMode: "itemised",
    shares: costcoSubtotals,
    items: costcoItems,
  });

  // 3. Pizza Night — itemised with proportional tax/tip, paid by Sam (Daniel's persona scenario, adapted).
  const pizzaItems = [
    { item_name: "Pepperoni Pizza (Lg)", quantity: 1, unit_price_cents: 2299, assignedUserIds: [maya.id, sam.id] },
    { item_name: "Veggie Pizza (Md)", quantity: 1, unit_price_cents: 1899, assignedUserIds: [jordan.id, sam.id] },
    { item_name: "Garlic Bread", quantity: 2, unit_price_cents: 449, assignedUserIds: [maya.id, jordan.id, sam.id] },
    { item_name: "Soft Drinks", quantity: 2, unit_price_cents: 349, assignedUserIds: [jordan.id, sam.id] },
  ];
  const pizzaLineItems = pizzaItems.map((it) => ({ id: it.item_name, lineTotalCents: it.quantity * it.unit_price_cents, assignedUserIds: it.assignedUserIds }));
  const pizzaSubtotals = splitItemised(pizzaLineItems);
  const pizzaSubtotalCents = pizzaLineItems.reduce((a, it) => a + it.lineTotalCents, 0);
  const pizzaTax = Math.round(pizzaSubtotalCents * 0.15);
  const pizzaTip = Math.round(pizzaSubtotalCents * 0.15);
  const pizzaTotal = pizzaSubtotalCents + pizzaTax + pizzaTip;
  const pizzaShares = allocateTaxTipDiscount({
    itemSubtotalsByUser: pizzaSubtotals,
    billSubtotalCents: pizzaSubtotalCents,
    discountAmountCents: 0,
    taxAmountCents: pizzaTax,
    taxAllocation: "proportional",
    tipAmountCents: pizzaTip,
    tipAllocation: "equal",
    totalAmountCents: pizzaTotal,
    paidBy: sam.id,
  });
  await confirmSeededExpense({
    description: "Pizza Night",
    totalCents: pizzaTotal,
    paidBy: sam.id,
    occurredOn: format(addDays(startOfMonth(TODAY), 8), "yyyy-MM-dd"),
    splitMode: "itemised",
    shares: pizzaShares,
    items: pizzaItems,
    taxCents: pizzaTax,
    tipCents: pizzaTip,
  });

  // 4. Internet bill — still a draft, so the UI's "confirm this" flow has something to demo live.
  await admin.from("group_expenses").insert({
    group_id: groupId,
    description: "Internet — Rogers",
    total_amount_cents: 10000,
    paid_by: maya.id,
    occurred_on: format(addDays(startOfMonth(TODAY), 6), "yyyy-MM-dd"),
    split_mode: "equal",
    status: "draft",
  });
  const { data: draftExpense } = await admin
    .from("group_expenses")
    .select("id")
    .eq("group_id", groupId)
    .eq("description", "Internet — Rogers")
    .single();
  if (draftExpense) {
    await admin
      .from("group_expense_shares")
      .insert([maya.id, jordan.id, sam.id].map((user_id) => ({ group_expense_id: draftExpense.id, user_id })));
  }

  // A partial settlement so balances look real (not everything zeroed or untouched).
  await admin.from("settlements").insert({
    group_id: groupId,
    from_user_id: jordan.id,
    to_user_id: maya.id,
    amount_cents: 3000,
    status: "settled",
    settled_at: new Date().toISOString(),
    note: "e-Transfer for groceries",
  });

  console.log("\nDone. Sign in with:");
  console.log(`  Email:    ${maya.email}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("\n(Jordan/Sam accounts exist only to populate Split Studio with realistic multi-person balances — you don't need to log into them.)");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
