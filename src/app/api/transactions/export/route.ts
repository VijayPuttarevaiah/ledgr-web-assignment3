import { requireUser } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/errors";
import { centsToDollars } from "@/lib/money";
import Papa from "papaparse";

/**
 * The only values the Ledger UI ever sends. Anything else is not a filter
 * the application supports, so it is not a filter this endpoint accepts.
 */
const ALLOWED_FILTERS = ["all", "income", "expenses", "recurring", "shared"] as const;
type Filter = (typeof ALLOWED_FILTERS)[number];

/**
 * §7.2 CSV export. Respects the same filter as the current Ledger view.
 *
 * Assignment 3 §4 — remediation of ZAP alert 30002 ("Format String Error",
 * Medium, CWE-134) on this route.
 *
 * The alert itself was ZAP noticing that a payload of `%n%s%n%s...` came
 * back changed, but the underlying defect it exposed is worse than a format
 * string: `filter` was read straight off the query string, never validated,
 * and then interpolated into a *response header*:
 *
 *     "Content-Disposition": `attachment; filename="ledgr-transactions-${filter}.csv"`
 *
 * That is attacker-controlled data in an HTTP header. At best a crafted
 * value breaks out of the quoted filename and dictates what the victim's
 * browser saves the download as; at worst it is an attempt at response
 * splitting. Node rejects the most blatant CRLF payloads by throwing, which
 * turns the request into a 500 rather than a compromise — but relying on
 * the runtime to catch it is not a control.
 *
 * The fix is to stop trusting the value at all. `filter` is now checked
 * against the allowlist above and anything unrecognised falls back to
 * "all", so only one of five known-safe literals can ever reach the header.
 */
export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const url = new URL(request.url);
    const requested = url.searchParams.get("filter") ?? "all";
    const filter: Filter = (ALLOWED_FILTERS as readonly string[]).includes(requested)
      ? (requested as Filter)
      : "all";

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
