import { requireUser } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/errors";
import { centsToDollars } from "@/lib/money";
import Papa from "papaparse";

/** §7.2 CSV export. Respects the same filter as the current Ledger view. */
export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") ?? "all";

    let builder = supabase
      .from("transactions")
      .select("occurred_on, type, description, amount_cents, payment_method, is_recurring, category:categories(name)")
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false });

    if (filter === "income") builder = builder.eq("type", "income");
    if (filter === "expenses") builder = builder.eq("type", "expense");
    if (filter === "recurring") builder = builder.eq("is_recurring", true);
    if (filter === "shared") builder = builder.not("source_group_expense_id", "is", null);

    const { data, error } = await builder;
    if (error) throw error;

    const rows = (data ?? []).map((t) => ({
      date: t.occurred_on,
      type: t.type,
      description: t.description,
      category: (t.category as unknown as { name: string } | null)?.name ?? "Uncategorized",
      amount: centsToDollars(t.amount_cents).toFixed(2),
      payment_method: t.payment_method ?? "",
      recurring: t.is_recurring ? "yes" : "no",
    }));
    const csv = Papa.unparse(rows);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ledgr-transactions-${filter}.csv"`,
      },
    });
  } catch (error) {
    return jsonError(error, "GET /api/transactions/export");
  }
}
