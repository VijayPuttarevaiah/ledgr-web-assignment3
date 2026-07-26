import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { bulkUpdateTransactionsSchema } from "@/lib/validation/transactions";
import { invalidateTransactionTotals } from "@/lib/api/transaction-summary";
import { invalidateAnalyticsSummary } from "@/lib/api/analytics-cache";

/** Bulk category-change / delete across selected rows (§7.2 — fixes the "143 rows, one at a time" gap). */
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const input = bulkUpdateTransactionsSchema.parse(await request.json());

    if (input.delete) {
      const { error, count } = await supabase
        .from("transactions")
        .delete({ count: "exact" })
        .in("id", input.ids)
        .eq("user_id", user.id);
      if (error) throw Errors.internal();
    // Assignment 3 §2: this write changes the user's lifetime totals, so
    // their cached aggregate is dropped rather than left to expire.
    invalidateTransactionTotals(user.id);
    invalidateAnalyticsSummary(user.id);

      return NextResponse.json({ deleted: count ?? 0 });
    }

    if (input.category_id !== undefined) {
      const { data, error } = await supabase
        .from("transactions")
        .update({ category_id: input.category_id })
        .in("id", input.ids)
        .eq("user_id", user.id)
        .select("id");
      if (error) throw Errors.internal();
      // The lifetime totals are untouched by a re-categorisation, but the
      // analytics category breakdown is exactly what just moved, so that
      // cache does have to go.
      invalidateAnalyticsSummary(user.id);
      return NextResponse.json({ updated: data.length });
    }

    throw Errors.badRequest("Choose a category to apply or confirm deletion.");
  } catch (error) {
    return jsonError(error, "POST /api/transactions/bulk");
  }
}
