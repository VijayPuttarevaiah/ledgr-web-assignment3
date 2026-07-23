import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { computeSharesForExpense } from "@/lib/split-compute";

/** §7.5 — a shareable PDF breakdown, generatable before confirming so everyone can verify the math first. */
export async function GET(_request: Request, context: { params: Promise<{ expenseId: string }> }) {
  try {
    const { expenseId } = await context.params;
    const { supabase } = await requireUser();

    const { data: expense } = await supabase.from("group_expenses").select("*, groups(name)").eq("id", expenseId).maybeSingle();
    if (!expense) throw Errors.notFound("That expense");

    const { data: items } = await supabase
      .from("group_expense_items")
      .select("item_name, quantity, unit_price_cents")
      .eq("group_expense_id", expenseId)
      .order("position");

    const { data: members } = await supabase.from("group_members").select("user_id").eq("group_id", expense.group_id);
    const memberIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = memberIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const nameById = new Map(
      (members ?? []).map((m) => [m.user_id, profileById.get(m.user_id) ?? "Member"])
    );

    let perPerson: { name: string; cents: number }[];
    try {
      const shares = await computeSharesForExpense(supabase, expenseId);
      perPerson = shares.map((s) => ({ name: nameById.get(s.user_id) ?? "Member", cents: s.computed_share_cents }));
    } catch {
      perPerson = [];
    }

    const subtotalCents = (items ?? []).reduce((a, it) => a + Math.round(Number(it.quantity) * it.unit_price_cents), 0);

    const [{ renderToBuffer }, React, { ReceiptDocument }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("react"),
      import("@/lib/pdf/receipt-document"),
    ]);
    const buffer = await renderToBuffer(
      React.createElement(ReceiptDocument, {
        groupName: (expense.groups as unknown as { name: string } | null)?.name ?? "Group",
        description: expense.description,
        occurredOn: expense.occurred_on,
        items: items ?? [],
        subtotalCents,
        taxCents: expense.tax_amount_cents,
        tipCents: expense.tip_amount_cents,
        discountCents: expense.discount_amount_cents,
        totalCents: expense.total_amount_cents,
        perPerson,
      }) as Parameters<typeof renderToBuffer>[0]
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="ledgr-${expense.description.replace(/[^a-z0-9]/gi, "-")}.pdf"`,
      },
    });
  } catch (error) {
    return jsonError(error, "GET /api/groups/[id]/expenses/[expenseId]/pdf");
  }
}
