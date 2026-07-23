import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceRecurrence } from "@/lib/recurring";
import { logger } from "@/lib/logger";

/**
 * §6.5 — daily cron, never gated by the AI kill switch (pure data
 * operation). Idempotency is enforced at the database layer (a unique
 * index on (recurring_rule_id, occurred_on)), so a duplicate invocation
 * for the same rule/day is a no-op, not a duplicate transaction.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    logger.warn({ route: "cron/recurring-transactions" }, "Rejected cron request with missing/incorrect CRON_SECRET");
    return NextResponse.json({ error: { message: "Unauthorized", code: "unauthorized" } }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: dueRules, error } = await admin
    .from("recurring_rules")
    .select("*")
    .eq("active", true)
    .lte("next_run_on", today);

  if (error) {
    logger.error({ err: error.message, route: "cron/recurring-transactions" }, "Failed to query due recurring rules");
    return NextResponse.json({ error: { message: "Query failed", code: "internal_error" } }, { status: 500 });
  }

  let created = 0;
  let skipped = 0;
  for (const rule of dueRules ?? []) {
    const { error: insertError } = await admin.from("transactions").insert({
      user_id: rule.user_id,
      type: rule.type,
      amount_cents: rule.amount_cents,
      description: rule.description,
      category_id: rule.category_id,
      payment_method: rule.payment_method,
      occurred_on: rule.next_run_on,
      is_recurring: true,
      recurring_rule_id: rule.id,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        skipped += 1; // already ran for this rule/day — idempotency guard did its job
      } else {
        logger.error({ err: insertError.message, ruleId: rule.id }, "Failed to insert recurring transaction");
        continue;
      }
    } else {
      created += 1;
    }

    const nextRunOn = advanceRecurrence(rule.next_run_on, rule.frequency as "weekly" | "monthly");
    await admin.from("recurring_rules").update({ next_run_on: nextRunOn }).eq("id", rule.id);
  }

  logger.info({ route: "cron/recurring-transactions", created, skipped, dueCount: dueRules?.length ?? 0 }, "Recurring transactions cron run complete");
  return NextResponse.json({ processed: dueRules?.length ?? 0, created, skipped });
}
