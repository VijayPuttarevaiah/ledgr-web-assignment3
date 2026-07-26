import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { createTransactionSchema, transactionsQuerySchema } from "@/lib/validation/transactions";
import { logger } from "@/lib/logger";
import { getTransactionTotals, invalidateTransactionTotals } from "@/lib/api/transaction-summary";
import { invalidateAnalyticsSummary } from "@/lib/api/analytics-cache";

const DUPLICATE_TOLERANCE_CENTS = 100;

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const url = new URL(request.url);
    const query = transactionsQuerySchema.parse(Object.fromEntries(url.searchParams));

    let builder = supabase
      .from("transactions")
      .select("*, category:categories(id, name, color, icon)", { count: "exact" })
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (query.filter === "income") builder = builder.eq("type", "income");
    if (query.filter === "expenses") builder = builder.eq("type", "expense");
    if (query.filter === "recurring") builder = builder.eq("is_recurring", true);
    if (query.filter === "shared") builder = builder.not("source_group_expense_id", "is", null);
    if (query.from) builder = builder.gte("occurred_on", query.from);
    if (query.to) builder = builder.lte("occurred_on", query.to);

    const fromIdx = (query.page - 1) * query.pageSize;
    const toIdx = fromIdx + query.pageSize - 1;
    const { data, error, count } = await builder.range(fromIdx, toIdx);
    if (error) throw Errors.internal();

    // Assignment 3 §2: the summary used to be computed by selecting every
    // one of this user's transactions and reducing the array here. That was
    // both expensive (42 KB of JSON per request on the load-test account,
    // growing with their history) and wrong (PostgREST caps the response at
    // db-max-rows, so the totals silently stopped at 1,000 rows). It is now
    // a cached call to the transaction_totals() aggregate.
    const totals = await getTransactionTotals(supabase, user.id);

    return NextResponse.json({
      transactions: data,
      page: query.page,
      pageSize: query.pageSize,
      total: count ?? 0,
      summary: {
        income_cents: totals.income_cents,
        expenses_cents: totals.expense_cents,
        net_cents: totals.income_cents - totals.expense_cents,
        count: totals.tx_count,
      },
    });
  } catch (error) {
    return jsonError(error, "GET /api/transactions");
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const body = await request.json();
    const confirmDuplicate = Boolean(body.confirm_duplicate);
    const input = createTransactionSchema.parse(body);

    if (!confirmDuplicate) {
      const { data: candidates } = await supabase
        .from("transactions")
        .select("id, description, amount_cents")
        .eq("user_id", user.id)
        .eq("occurred_on", input.occurred_on)
        .gte("amount_cents", input.amount_cents - DUPLICATE_TOLERANCE_CENTS)
        .lte("amount_cents", input.amount_cents + DUPLICATE_TOLERANCE_CENTS);

      const normalizedNew = input.description.trim().toLowerCase();
      const similar = candidates?.find((c) => {
        const normalizedExisting = c.description.trim().toLowerCase();
        return normalizedExisting === normalizedNew || normalizedExisting.includes(normalizedNew) || normalizedNew.includes(normalizedExisting);
      });
      if (similar) {
        throw Errors.possibleDuplicate(
          `A similar transaction ("${similar.description}") from today already exists — add anyway?`
        );
      }
    }

    let recurringRuleId: string | null = null;
    if (input.is_recurring && input.recurring_frequency) {
      const { advanceRecurrence } = await import("@/lib/recurring");
      const { data: rule, error: ruleError } = await supabase
        .from("recurring_rules")
        .insert({
          user_id: user.id,
          type: input.type,
          amount_cents: input.amount_cents,
          description: input.description,
          category_id: input.category_id ?? null,
          payment_method: input.payment_method ?? null,
          frequency: input.recurring_frequency,
          next_run_on: advanceRecurrence(input.occurred_on, input.recurring_frequency),
        })
        .select("id")
        .single();
      if (ruleError) {
        logger.error({ route: "POST /api/transactions", err: ruleError.message }, "Failed to create recurring rule");
      } else {
        recurringRuleId = rule.id;
      }
    }

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type: input.type,
        amount_cents: input.amount_cents,
        description: input.description,
        category_id: input.category_id ?? null,
        payment_method: input.payment_method ?? null,
        occurred_on: input.occurred_on,
        is_recurring: input.is_recurring ?? false,
        recurring_rule_id: recurringRuleId,
        receipt_image_path: input.receipt_image_path ?? null,
        ai_category_confidence: input.ai_category_confidence ?? null,
      })
      .select("*, category:categories(id, name, color, icon)")
      .single();
    if (error) throw Errors.internal();

    // The user's lifetime totals just changed; drop their cached aggregate
    // so the next read recomputes instead of showing a pre-insert figure.
    invalidateTransactionTotals(user.id);
    invalidateAnalyticsSummary(user.id);

    return NextResponse.json({ transaction: data }, { status: 201 });
  } catch (error) {
    return jsonError(error, "POST /api/transactions");
  }
}
