"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-context";

interface Category {
  id: string;
  name: string;
}

export function BudgetManager({ categories, month }: { categories: Category[]; month: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const cents = Math.round(Number(amount) * 100);
    if (!cents || cents < 0) {
      setError("Enter a budget amount.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId, month, base_amount_cents: cents }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json();
      setError(body.error?.message ?? "Couldn't save that budget. Try again.");
      return;
    }
    toast("Budget saved.");
    setOpen(false);
    setAmount("");
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-gold hover:underline">
        + Set a budget
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-bold text-text-faint uppercase">New budget for this month</div>
        <button onClick={() => setOpen(false)} aria-label="Close" className="text-text-faint hover:text-text-dim">
          <X size={14} />
        </button>
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2.5">
        <div>
          <FieldLabel htmlFor="budgetCategory">Category</FieldLabel>
          <Select id="budgetCategory" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FieldLabel htmlFor="budgetAmount">Monthly amount</FieldLabel>
          <Input id="budgetAmount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      {error && <div className="mb-2.5 text-xs text-coral">{error}</div>}
      <Button size="sm" onClick={submit} loading={saving}>
        Save budget
      </Button>
    </div>
  );
}
