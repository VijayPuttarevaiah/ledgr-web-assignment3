import Link from "next/link";
import { startOfMonth, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getAnalyticsSummary, type AnalyticsRange } from "@/lib/analytics";
import { Card, CardLabel } from "@/components/ui/card";
import { Bar2 } from "@/components/dashboard/bar2";
import { formatCents } from "@/lib/money";
import { CashFlowChart } from "@/components/analytics/cash-flow-chart";
import { AiNarrativeCard } from "@/components/analytics/ai-narrative-card";
import { BudgetManager } from "@/components/analytics/budget-manager";
import { aiClientFlags } from "@/lib/ai/client-flags";

const RANGES: AnalyticsRange[] = ["1D", "1W", "1M", "3M", "1Y", "All"];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rangeParam } = await searchParams;
  const range = (RANGES.includes(rangeParam as AnalyticsRange) ? rangeParam : "1M") as AnalyticsRange;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { kpis, cashFlow, categoryBreakdown, budgetHealth } = await getAnalyticsSummary(supabase, user.id, range);
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .neq("name", "Income")
    .order("name");
  const currentMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const kpiTiles = [
    { label: "Spending", value: formatCents(kpis.spendingCents), sub: undefined },
    { label: "Income", value: formatCents(kpis.incomeCents), sub: undefined },
    { label: "Savings rate", value: `${kpis.savingsRatePct}%`, sub: undefined },
    { label: "Shared", value: formatCents(kpis.sharedCents), sub: `${kpis.sharedPct}% of total` },
    {
      label: "Budget adherence",
      value: kpis.budgetAdherencePct !== null ? `${kpis.budgetAdherencePct}%` : "—",
      sub: budgetHealth.length > 0 ? `${budgetHealth.filter((b) => b.pct <= 100).length}/${budgetHealth.length} categories healthy` : "No budgets set",
    },
  ];

  return (
    <div className="p-7">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/analytics?range=${r}`}
            className={
              "rounded-lg border border-border px-3.5 py-1.5 text-[12.5px] font-bold " +
              (r === range ? "bg-gold text-gold-ink" : "text-text-dim")
            }
          >
            {r}
          </Link>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-5">
        {kpiTiles.map((t) => (
          <Card key={t.label}>
            <CardLabel>{t.label}</CardLabel>
            <div className="text-[22px] font-extrabold">{t.value}</div>
            {t.sub && <div className="mt-1 text-[11.5px] text-text-faint">{t.sub}</div>}
          </Card>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardLabel>Cash flow · income vs expense</CardLabel>
          {cashFlow.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-dim">No transactions in this period yet.</div>
          ) : (
            <CashFlowChart data={cashFlow} />
          )}
        </Card>
        <Card>
          <CardLabel>Category breakdown</CardLabel>
          {categoryBreakdown.length === 0 ? (
            <div className="text-sm text-text-dim">No spending in this period yet.</div>
          ) : (
            categoryBreakdown.slice(0, 6).map((c) => (
              <div key={c.id} className="mb-2.5">
                <div className="mb-1 flex justify-between text-[12.5px]">
                  <span>{c.name}</span>
                  <span className="text-text-dim">{c.pct}%</span>
                </div>
                <Bar2 pct={c.pct} color={c.color} thin />
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="mb-4">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <CardLabel>Budget vs actual · this month</CardLabel>
            {budgetHealth.length > 0 && categories && categories.length > 0 && (
              <BudgetManager categories={categories} month={currentMonth} />
            )}
          </div>
          {budgetHealth.length === 0 ? (
            <div className="text-sm text-text-dim">
              {categories && categories.length > 0 ? (
                <BudgetManager categories={categories} month={currentMonth} />
              ) : (
                "No budgets set yet."
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {budgetHealth.map((b) => (
                <div key={b.name}>
                  <div className="mb-1 flex justify-between text-[12.5px]">
                    <span>{b.name}</span>
                    <span className={b.pct > 100 ? "font-bold text-coral" : "text-text-dim"}>
                      {b.pct}% {b.pct > 100 ? `· ${formatCents(b.overCents)} over` : `· ${formatCents(Math.abs(b.overCents))} left`}
                    </span>
                  </div>
                  <Bar2 pct={Math.min(b.pct, 100)} color={b.pct > 100 ? "var(--color-coral)" : "var(--color-teal)"} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {aiClientFlags.narrative && <AiNarrativeCard />}
    </div>
  );
}
