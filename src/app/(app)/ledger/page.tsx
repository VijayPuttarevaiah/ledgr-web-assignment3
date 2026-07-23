import Link from "next/link";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable, type TransactionRow } from "@/components/ledger/ledger-table";
import { formatCentsSigned } from "@/lib/money";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "recurring", label: "Recurring" },
  { key: "shared", label: "Shared" },
] as const;

const PAGE_SIZE = 20;

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { filter = "all", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let builder = supabase
    .from("transactions")
    .select("*, category:categories(id, name, color, icon)", { count: "exact" })
    .eq("user_id", user.id)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (filter === "income") builder = builder.eq("type", "income");
  if (filter === "expenses") builder = builder.eq("type", "expense");
  if (filter === "recurring") builder = builder.eq("is_recurring", true);
  if (filter === "shared") builder = builder.not("source_group_expense_id", "is", null);

  const from = (page - 1) * PAGE_SIZE;
  const { data: transactions, count } = await builder.range(from, from + PAGE_SIZE - 1);

  const { data: allForSummary } = await supabase.from("transactions").select("type, amount_cents").eq("user_id", user.id);
  const income = (allForSummary ?? []).filter((t) => t.type === "income").reduce((a, t) => a + t.amount_cents, 0);
  const expenses = (allForSummary ?? []).filter((t) => t.type === "expense").reduce((a, t) => a + t.amount_cents, 0);

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("name");

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-4 sm:p-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[22px] font-extrabold">Personal Ledger</div>
        <a
          href={`/api/transactions/export?filter=${filter}`}
          className="rounded-[9px] border border-border bg-surface-2 px-4 py-2.5 text-[13.5px] font-semibold text-text hover:bg-border/60"
        >
          Export CSV
        </a>
      </div>

      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto border-b border-border">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/ledger?filter=${f.key}`}
            className={
              "border-b-2 px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap " +
              (filter === f.key ? "border-gold text-gold" : "border-transparent text-text-dim hover:text-text")
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-4 sm:gap-8">
        <SummaryStat label="Income" value={formatCentsSigned(income)} className="text-teal" />
        <SummaryStat label="Expenses" value={formatCentsSigned(-expenses)} className="text-coral" />
        <SummaryStat label="Net" value={formatCentsSigned(income - expenses)} />
        <SummaryStat label="Transactions" value={String(total)} />
      </div>

      {!transactions || transactions.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filter === "all" ? "No transactions yet" : `No ${filter} transactions`}
          body="Add your first entry with the + New entry button in the top bar, or drop a receipt photo in and let LEDGR fill in the details."
        />
      ) : (
        <>
          <LedgerTable transactions={transactions as unknown as TransactionRow[]} categories={categories ?? []} filter={filter} />
          <div className="mt-4 flex items-center justify-between text-xs text-text-faint">
            <span>
              Showing {from + 1}–{Math.min(from + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <PageLink filter={filter} page={page - 1} disabled={page <= 1} label="Previous" />
              <span className="px-2 py-1">
                Page {page} of {totalPages}
              </span>
              <PageLink filter={filter} page={page + 1} disabled={page >= totalPages} label="Next" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-faint">{label}</div>
      <div className={`text-lg font-bold ${className ?? "text-text"}`}>{value}</div>
    </div>
  );
}

function PageLink({ filter, page, disabled, label }: { filter: string; page: number; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="cursor-not-allowed rounded border border-border px-2.5 py-1 opacity-40">{label}</span>;
  }
  return (
    <Link href={`/ledger?filter=${filter}&page=${page}`} className="rounded border border-border px-2.5 py-1 hover:text-text">
      {label}
    </Link>
  );
}
