import { NextResponse } from "next/server";
import { startOfMonth, subMonths, format } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeRolloverCents } from "@/lib/budget-rollover";
import { logger } from "@/lib/logger";

/**
 * §6.3 — runs monthly (1st of the month). For every budget that existed
 * last month, carries the base amount forward (unless the user already set
 * this month's budget explicitly) and computes this month's rollover from
 * last month's actual spend, capped at 50% of the base amount.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    logger.warn({ route: "cron/budget-rollover" }, "Rejected cron request with missing/incorrect CRON_SECRET");
    return NextResponse.json({ error: { message: "Unauthorized", code: "unauthorized" } }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const currentMonth = format(startOfMonth(now), "yyyy-MM-dd");
  const previousMonth = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
  const previousMonthEnd = format(startOfMonth(now), "yyyy-MM-dd");

  const { data: previousBudgets, error } = await admin.from("budgets").select("*").eq("month", previousMonth);
  if (error) {
    logger.error({ err: error.message, route: "cron/budget-rollover" }, "Failed to query previous month's budgets");
    return NextResponse.json({ error: { message: "Query failed", code: "internal_error" } }, { status: 500 });
  }

  let processed = 0;
  for (const prev of previousBudgets ?? []) {
    const { data: spendRows } = await admin
      .from("transactions")
      .select("amount_cents")
      .eq("user_id", prev.user_id)
      .eq("category_id", prev.category_id)
      .eq("type", "expense")
      .gte("occurred_on", previousMonth)
      .lt("occurred_on", previousMonthEnd);

    const actualSpend = (spendRows ?? []).reduce((a, r) => a + r.amount_cents, 0);
    const rollover = computeRolloverCents(prev.base_amount_cents, actualSpend);

    const { data: existing } = await admin
      .from("budgets")
      .select("id")
      .eq("user_id", prev.user_id)
      .eq("category_id", prev.category_id)
      .eq("month", currentMonth)
      .maybeSingle();

    if (existing) {
      await admin.from("budgets").update({ rollover_amount_cents: rollover }).eq("id", existing.id);
    } else {
      await admin.from("budgets").insert({
        user_id: prev.user_id,
        category_id: prev.category_id,
        month: currentMonth,
        base_amount_cents: prev.base_amount_cents,
        rollover_amount_cents: rollover,
      });
    }
    processed += 1;
  }

  logger.info({ route: "cron/budget-rollover", processed }, "Budget rollover cron run complete");
  return NextResponse.json({ processed });
}
