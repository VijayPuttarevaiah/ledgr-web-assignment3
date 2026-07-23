import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { createRecurringRuleSchema } from "@/lib/validation/budgets";

export async function GET() {
  try {
    const { user, supabase } = await requireUser();
    const { data, error } = await supabase
      .from("recurring_rules")
      .select("*, category:categories(id, name, color)")
      .eq("user_id", user.id)
      .order("next_run_on");
    if (error) throw Errors.internal();
    return NextResponse.json({ rules: data });
  } catch (error) {
    return jsonError(error, "GET /api/recurring-rules");
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const input = createRecurringRuleSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("recurring_rules")
      .insert({ user_id: user.id, ...input })
      .select("*, category:categories(id, name, color)")
      .single();
    if (error) throw Errors.internal();

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (error) {
    return jsonError(error, "POST /api/recurring-rules");
  }
}
