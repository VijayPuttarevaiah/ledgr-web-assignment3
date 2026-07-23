import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { format, startOfMonth, startOfDay, subDays, subMonths, subYears } from "date-fns";
import { effectiveBudgetCents } from "@/lib/budget-rollover";

export type AnalyticsRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "All";

export function rangeStartDate(range: AnalyticsRange): Date | null {
  const now = new Date();
  switch (range) {
    case "1D":
      return startOfDay(now);
    case "1W":
      return subDays(now, 7);
    case "1M":
      return subDays(now, 30);
    case "3M":
      return subMonths(now, 3);
    case "1Y":
      return subYears(now, 1);
    case "All":
      return null;
  }
}

export async function getAnalyticsSummary(supabase: SupabaseClient<Database>, userId: string, range: AnalyticsRange) {
  const start = rangeStartDate(range);
  const startISO = start ? format(start, "yyyy-MM-dd") : "1970-01-01";
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const { data: tx } = await supabase
    .from("transactions")
    .select("type, amount_cents, occurred_on, category_id, source_group_expense_id")
    .eq("user_id", userId)
    .gte("occurred_on", startISO);

  const { data: categories } = await supabase.from("categories").select("id, name, color").or(`user_id.eq.${userId},user_id.is.null`);
  const { data: budgets } = await supabase
    .from("budgets")
    .select("category_id, base_amount_cents, rollover_amount_cents")
    .eq("user_id", userId)
    .eq("month", monthStart);

  const rows = tx ?? [];
  const income = rows.filter((t) => t.type === "income").reduce((a, t) => a + t.amount_cents, 0);
  const expense = rows.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount_cents, 0);
  const savingsRatePct = income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : 0;
  const sharedExpense = rows.filter((t) => t.type === "expense" && t.source_group_expense_id).reduce((a, t) => a + t.amount_cents, 0);
  const sharedPct = expense > 0 ? Math.round((sharedExpense / expense) * 1000) / 10 : 0;

  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));
  const categorySpend = new Map<string, number>();
  for (const t of rows) {
    if (t.type !== "expense") continue;
    const key = t.category_id ?? "uncategorized";
    categorySpend.set(key, (categorySpend.get(key) ?? 0) + t.amount_cents);
  }
  const categoryBreakdown = [...categorySpend.entries()]
    .map(([id, cents]) => ({
      id,
      name: id === "uncategorized" ? "Uncategorized" : (categoryMap.get(id)?.name ?? "Other"),
      color: id === "uncategorized" ? "#9a9aa4" : (categoryMap.get(id)?.color ?? "#9a9aa4"),
      cents,
      pct: expense > 0 ? Math.round((cents / expense) * 100) : 0,
    }))
    .sort((a, b) => b.cents - a.cents);

  const monthSpendByCategory = new Map<string, number>();
  for (const t of rows) {
    if (t.type !== "expense" || t.occurred_on < monthStart) continue;
    const key = t.category_id ?? "uncategorized";
    monthSpendByCategory.set(key, (monthSpendByCategory.get(key) ?? 0) + t.amount_cents);
  }
  const budgetHealth = (budgets ?? []).map((b) => {
    const category = categoryMap.get(b.category_id);
    const spent = monthSpendByCategory.get(b.category_id) ?? 0;
    const effective = effectiveBudgetCents(b.base_amount_cents, b.rollover_amount_cents);
    const pct = effective > 0 ? Math.round((spent / effective) * 100) : 0;
    return { name: category?.name ?? "Budget", spentCents: spent, effectiveCents: effective, pct, overCents: spent - effective };
  });
  const healthyCount = budgetHealth.filter((b) => b.pct <= 100).length;
  const budgetAdherencePct = budgetHealth.length > 0 ? Math.round((healthyCount / budgetHealth.length) * 100) : null;

  // Cash-flow buckets: daily for short ranges, monthly otherwise.
  const daily = range === "1D" || range === "1W" || range === "1M";
  const buckets = new Map<string, { income: number; expense: number }>();
  for (const t of rows) {
    const key = daily ? t.occurred_on : t.occurred_on.slice(0, 7);
    const bucket = buckets.get(key) ?? { income: 0, expense: 0 };
    if (t.type === "income") bucket.income += t.amount_cents;
    else bucket.expense += t.amount_cents;
    buckets.set(key, bucket);
  }
  const cashFlow = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      label: daily ? format(new Date(key), "MMM d") : format(new Date(`${key}-01`), "MMM yyyy"),
      income: v.income / 100,
      expense: v.expense / 100,
    }));

  return {
    kpis: {
      spendingCents: expense,
      incomeCents: income,
      savingsRatePct,
      sharedPct,
      sharedCents: sharedExpense,
      budgetAdherencePct,
    },
    cashFlow,
    categoryBreakdown,
    budgetHealth,
  };
}

export type AnalyticsSummary = Awaited<ReturnType<typeof getAnalyticsSummary>>;
