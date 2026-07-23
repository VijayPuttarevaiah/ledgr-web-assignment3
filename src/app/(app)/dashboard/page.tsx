import Link from "next/link";
import dynamic from "next/dynamic";
import { startOfMonth, subMonths, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { balancesForUser } from "@/lib/balances";
import { effectiveBudgetCents } from "@/lib/budget-rollover";
import { Card, CardLabel } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money-text";
import { formatCents, formatCentsSigned } from "@/lib/money";
import { Bar2 } from "@/components/dashboard/bar2";

// §10 perf pass: recharts (~80KB gzipped) is code-split into its own chunk,
// fetched only once the dashboard actually renders, instead of shipping in
// every route's shared bundle. See DECISIONS.md for the measured before/after.
const SpendingTrendChart = dynamic(() =>
  import("@/components/dashboard/spending-trend-chart").then((m) => m.SpendingTrendChart)
);

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const sixMonthsAgo = format(startOfMonth(subMonths(new Date(), 5)), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const [
    { data: allTx },
    { data: categories },
    { data: budgets },
    { data: memberships },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount_cents, occurred_on, category_id, description, source_group_expense_id")
      .eq("user_id", user.id)
      .gte("occurred_on", sixMonthsAgo),
    supabase.from("categories").select("id, name, color").or(`user_id.eq.${user.id},user_id.is.null`),
    supabase.from("budgets").select("category_id, base_amount_cents, rollover_amount_cents").eq("user_id", user.id).eq("month", monthStart),
    supabase.from("group_members").select("group_id, groups(name)").eq("user_id", user.id),
  ]);

  const groupIds = (memberships ?? []).map((m) => m.group_id);
  let balances: ReturnType<typeof balancesForUser> = [];
  const groupNameById = new Map((memberships ?? []).map((m) => [m.group_id, (m.groups as unknown as { name: string } | null)?.name ?? "Group"]));
  if (groupIds.length > 0) {
    const [{ data: shares }, { data: expenses }, { data: settlements }] = await Promise.all([
      supabase.from("group_expense_shares").select("group_expense_id, user_id, computed_share_cents").in(
        "group_expense_id",
        (await supabase.from("group_expenses").select("id").in("group_id", groupIds)).data?.map((e) => e.id) ?? [""]
      ),
      supabase.from("group_expenses").select("id, group_id, paid_by, status").in("group_id", groupIds),
      supabase.from("settlements").select("group_id, from_user_id, to_user_id, amount_cents, status").in("group_id", groupIds),
    ]);
    balances = balancesForUser(shares ?? [], expenses ?? [], settlements ?? [], user.id);
  }

  const allTime = allTx ?? [];
  const allTimeIncome = allTime.filter((t) => t.type === "income").reduce((a, t) => a + t.amount_cents, 0);
  const allTimeExpense = allTime.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount_cents, 0);
  const netBalance = allTimeIncome - allTimeExpense;

  const monthTx = allTime.filter((t) => t.occurred_on >= monthStart);
  const monthIncome = monthTx.filter((t) => t.type === "income").reduce((a, t) => a + t.amount_cents, 0);
  const monthExpense = monthTx.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount_cents, 0);
  const spendPct = monthIncome > 0 ? Math.round((monthExpense / monthIncome) * 100) : monthExpense > 0 ? 100 : 0;

  const owedToYou = balances.filter((b) => b.netCents > 0).reduce((a, b) => a + b.netCents, 0);
  const openSplitCount = balances.length;

  const trend = Array.from({ length: 6 }, (_, i) => {
    const monthDate = subMonths(new Date(), 5 - i);
    const key = format(startOfMonth(monthDate), "yyyy-MM");
    const spend = allTime
      .filter((t) => t.type === "expense" && t.occurred_on.startsWith(key))
      .reduce((a, t) => a + t.amount_cents, 0);
    return { m: format(monthDate, "MMM"), v: spend / 100 };
  });

  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));
  const categoryTotals = new Map<string, number>();
  for (const t of monthTx) {
    if (t.type !== "expense") continue;
    const key = t.category_id ?? "uncategorized";
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + t.amount_cents);
  }
  const categoryBreakdown = [...categoryTotals.entries()]
    .map(([id, cents]) => ({
      id,
      name: id === "uncategorized" ? "Uncategorized" : (categoryMap.get(id)?.name ?? "Other"),
      color: id === "uncategorized" ? "#9a9aa4" : (categoryMap.get(id)?.color ?? "#9a9aa4"),
      cents,
      pct: monthExpense > 0 ? Math.round((cents / monthExpense) * 100) : 0,
    }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 5);

  const budgetHealth = (budgets ?? [])
    .map((b) => {
      const category = categoryMap.get(b.category_id);
      const spent = categoryTotals.get(b.category_id) ?? 0;
      const effective = effectiveBudgetCents(b.base_amount_cents, b.rollover_amount_cents);
      const pct = effective > 0 ? Math.round((spent / effective) * 100) : 0;
      return { name: category?.name ?? "Budget", spent, effective, pct };
    })
    .slice(0, 3);

  const recentShared = monthTx
    .filter((t) => t.source_group_expense_id || t.type === "income")
    .slice(0, 4);

  return (
    <div className="p-7">
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardLabel>Net balance</CardLabel>
          <div className="text-[34px] font-extrabold">{formatCentsSigned(netBalance)}</div>
          <div className="mt-2 text-xs text-text-faint">All-time income minus expenses</div>
        </Card>
        <Card>
          <CardLabel>{format(new Date(), "MMMM")} spending</CardLabel>
          <div className="text-[28px] font-extrabold">{formatCents(monthExpense)}</div>
          <div className="mb-2 text-xs text-text-faint">of {formatCents(monthIncome)} income</div>
          <Bar2 pct={spendPct} color="var(--color-gold)" />
        </Card>
        <Card>
          <CardLabel>Owed to you</CardLabel>
          <div className="text-[28px] font-extrabold text-teal">{formatCents(Math.max(owedToYou, 0))}</div>
          <div className="mb-2.5 text-xs text-text-faint">
            {openSplitCount} open split{openSplitCount === 1 ? "" : "s"}
          </div>
          <Link
            href="/split"
            className="inline-flex items-center gap-1 rounded-[9px] border border-teal/40 px-3 py-1.5 text-xs font-semibold text-teal hover:bg-teal/10"
          >
            Settle up →
          </Link>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardLabel>Spending trend · last 6 months</CardLabel>
          <SpendingTrendChart data={trend} />
        </Card>
        <Card>
          <CardLabel>By category</CardLabel>
          {categoryBreakdown.length === 0 ? (
            <div className="text-xs text-text-faint">No spending yet this month.</div>
          ) : (
            categoryBreakdown.map((c) => (
              <div key={c.id} className="mb-2">
                <div className="mb-1 flex justify-between text-xs">
                  <span>{c.name}</span>
                  <span className="text-text-dim">{c.pct}%</span>
                </div>
                <Bar2 pct={c.pct} color={c.color} thin />
              </div>
            ))
          )}
        </Card>
        <Card>
          <CardLabel>Budget health</CardLabel>
          {budgetHealth.length === 0 ? (
            <div className="text-xs text-text-faint">
              No budgets set yet.{" "}
              <Link href="/analytics" className="text-gold hover:underline">
                Set one →
              </Link>
            </div>
          ) : (
            budgetHealth.map((b) => {
              const over = b.spent - b.effective;
              return (
                <div key={b.name} className="mb-2.5">
                  <div className="mb-1 flex justify-between text-xs">
                    <span>{b.name}</span>
                    <span className={b.pct > 100 ? "font-semibold text-coral" : "text-text-dim"}>
                      {b.pct}% {b.pct > 100 ? `· ${formatCents(over)} over` : `· ${formatCents(Math.abs(over))} left`}
                    </span>
                  </div>
                  <Bar2 pct={Math.min(b.pct, 100)} color={b.pct > 100 ? "var(--color-coral)" : "var(--color-teal)"} thin />
                </div>
              );
            })
          )}
        </Card>
        <Card>
          <CardLabel>Recent shared activity</CardLabel>
          {recentShared.length === 0 ? (
            <div className="text-xs text-text-faint">Nothing shared yet this month.</div>
          ) : (
            recentShared.map((t, i) => (
              <div key={i} className="flex justify-between border-b border-border py-1.5 text-[12.5px] last:border-b-0">
                <span className="text-[#d0d0cc]">{t.description.length > 22 ? `${t.description.slice(0, 22)}…` : t.description}</span>
                <MoneyText cents={t.amount_cents} direction={t.type === "income" ? "in" : "out"} signed className="font-semibold" />
              </div>
            ))
          )}
          <div className="mt-1.5 text-[11px] text-text-faint">Only shared/income items shown here — see full history in Ledger.</div>
        </Card>
      </div>

      {balances.length > 0 && (
        <Card>
          <CardLabel>Open balances</CardLabel>
          <div className="flex flex-wrap gap-4">
            {balances.slice(0, 4).map((b, i) => (
              <Link
                key={i}
                href="/split"
                className="flex-1 min-w-[160px] rounded-[10px] border border-border bg-surface-2 p-3.5 text-left hover:border-gold/40"
              >
                <div className="mb-2 text-[13.5px] font-bold">{groupNameById.get(b.groupId) ?? "Group"}</div>
                <MoneyText cents={b.netCents} direction={b.netCents > 0 ? "in" : "out"} signed className="font-bold" />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
