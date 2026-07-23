"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Trash2 } from "lucide-react";
import { CategoryPill, UncategorizedPill } from "@/components/ui/category-pill";
import { MoneyText, directionForTransaction } from "@/components/ui/money-text";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-context";
import { useConfirm } from "@/components/providers/confirm-context";
import type { Category } from "@/types/domain";

interface TransactionRow {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  payment_method: string | null;
  is_recurring: boolean;
  source_group_expense_id: string | null;
  category: { id: string; name: string; color: string } | null;
}

export function LedgerTable({
  transactions,
  categories,
  filter,
}: {
  transactions: TransactionRow[];
  categories: Category[];
  filter: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkCategory, setBulkCategory] = useState("");

  const allSelected = transactions.length > 0 && selected.size === transactions.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(transactions.map((t) => t.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function applyBulkCategory() {
    const res = await fetch("/api/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], category_id: bulkCategory || null }),
    });
    if (res.ok) {
      toast(`Updated category on ${selected.size} transaction${selected.size === 1 ? "" : "s"}.`);
      setSelected(new Set());
      router.refresh();
    } else {
      toast("Couldn't update those transactions. Try again.", { tone: "error" });
    }
  }

  async function bulkDelete() {
    const ok = await confirm({
      title: `Delete ${selected.size} transaction${selected.size === 1 ? "" : "s"}?`,
      body: "This can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch("/api/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], delete: true }),
    });
    if (res.ok) {
      toast(`Deleted ${selected.size} transaction${selected.size === 1 ? "" : "s"}.`);
      setSelected(new Set());
      router.refresh();
    } else {
      toast("Couldn't delete those transactions. Try again.", { tone: "error" });
    }
  }

  async function deleteOne(id: string) {
    const ok = await confirm({
      title: "Delete this transaction?",
      body: "This can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Transaction deleted.");
      router.refresh();
    } else {
      toast("Couldn't delete that transaction. Try again.", { tone: "error" });
    }
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-[10px] border border-gold/40 bg-gold/10 px-4 py-2.5">
          <span className="text-[13px] font-semibold text-text">{selected.size} selected</span>
          <Select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="w-48">
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" onClick={applyBulkCategory}>
            Apply category
          </Button>
          <Button size="sm" variant="danger" onClick={bulkDelete}>
            Delete
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-text-faint hover:text-text-dim">
            Clear
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[28px_80px_1fr_130px_120px_100px_70px] items-center gap-2 border-b border-border px-4 py-2.5 text-[11px] tracking-wide text-text-faint uppercase">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all transactions" />
          <div>Date</div>
          <div>Description</div>
          <div>Category</div>
          <div>Method</div>
          <div className="text-right">Amount</div>
          <div />
        </div>
        {transactions.map((t) => (
          <LedgerRow
            key={t.id}
            t={t}
            categories={categories}
            selected={selected.has(t.id)}
            onToggle={() => toggleOne(t.id)}
            editing={editingId === t.id}
            onStartEdit={() => setEditingId(t.id)}
            onCancelEdit={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              router.refresh();
            }}
            onDelete={() => deleteOne(t.id)}
          />
        ))}
      </div>
      {filter === "shared" && transactions.length > 0 && (
        <div className="mt-2 text-[11px] text-text-faint">Shared expenses flow in automatically once a split is confirmed.</div>
      )}
    </div>
  );
}

function LedgerRow({
  t,
  categories,
  selected,
  onToggle,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onDelete,
}: {
  t: TransactionRow;
  categories: Category[];
  selected: boolean;
  onToggle: () => void;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [description, setDescription] = useState(t.description);
  const [amount, setAmount] = useState((t.amount_cents / 100).toFixed(2));
  const [categoryId, setCategoryId] = useState(t.category?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/transactions/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: description.trim(),
        amount_cents: Math.round(Number(amount) * 100),
        category_id: categoryId || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast("Transaction updated.");
      onSaved();
    } else {
      toast("Couldn't save that change. Try again.", { tone: "error" });
    }
  }

  if (editing) {
    return (
      <div className="grid grid-cols-[28px_80px_1fr_130px_120px_100px_70px] items-center gap-2 border-b border-border bg-surface-2/40 px-4 py-2">
        <div />
        <div className="text-text-dim">{t.occurred_on}</div>
        <input
          className="rounded border border-border bg-surface-2 px-2 py-1 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="!py-1 text-xs">
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <input
          className="w-24 rounded border border-border bg-surface-2 px-2 py-1 text-sm"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <div className="flex justify-end gap-1">
          <button onClick={save} disabled={saving} aria-label="Save" className="text-teal">
            <Check size={16} />
          </button>
          <button onClick={onCancelEdit} aria-label="Cancel" className="text-text-faint">
            <X size={16} />
          </button>
        </div>
        <div />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[28px_80px_1fr_130px_120px_100px_70px] items-center gap-2 border-b border-border px-4 py-3 text-[13.5px] last:border-b-0">
      <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${t.description}`} />
      <div className="text-text-dim">{t.occurred_on}</div>
      <div>
        {t.description}
        {t.is_recurring && (
          <span className="ml-1.5 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-text-faint">recurring</span>
        )}
        {t.source_group_expense_id && (
          <span className="ml-1.5 rounded-full border border-teal/40 px-1.5 py-0.5 text-[10px] text-teal">shared</span>
        )}
      </div>
      <div>{t.category ? <CategoryPill name={t.category.name} color={t.category.color} /> : <UncategorizedPill />}</div>
      <div className="text-text-dim">{t.payment_method ?? "—"}</div>
      <MoneyText cents={t.amount_cents} direction={directionForTransaction(t.type)} signed className="text-right font-bold" />
      <div className="flex justify-end gap-2.5">
        <button onClick={onStartEdit} className="text-xs font-semibold text-gold hover:underline">
          Edit
        </button>
        <button onClick={onDelete} aria-label={`Delete ${t.description}`} className="text-xs font-semibold text-text-faint hover:text-coral">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
