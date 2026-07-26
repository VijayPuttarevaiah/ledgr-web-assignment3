import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { invalidateAnalyticsSummary } from "@/lib/api/analytics-cache";
import { upsertBudgetSchema } from "@/lib/validation/budgets";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    if (!month) throw Errors.badRequest("Provide a month (YYYY-MM-01).");

    const { data, error } = await supabase
      .from("budgets")
      .select("*, category:categories(id, name, color)")
      .eq("user_id", user.id)
      .eq("month", month);
    if (error) throw Errors.internal();

    return NextResponse.json({ budgets: data });
  } catch (error) {
    return jsonError(error, "GET /api/budgets");
  }
}

/** Upsert (create or update) a category's budget for a month. Rollover is computed separately by the cron job (§6.3). */
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const input = upsertBudgetSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("budgets")
      .upsert(
        { user_id: user.id, category_id: input.category_id, month: input.month, base_amount_cents: input.base_amount_cents },
        { onConflict: "user_id,category_id,month" }
      )
      .select("*, category:categories(id, name, color)")
      .single();
    if (error) throw Errors.internal();

    // Budget health is part of the cached analytics summary, so a budget
    // change has to drop it too.
    invalidateAnalyticsSummary(user.id);

    return NextResponse.json({ budget: data }, { status: 201 });
  } catch (error) {
    return jsonError(error, "POST /api/budgets");
  }
}
