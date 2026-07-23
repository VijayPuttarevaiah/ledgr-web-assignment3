"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/providers/toast-context";

type SplitMode = "equal" | "itemised" | "exact" | "weighted";

interface Member {
  user_id: string;
  full_name: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddExpensePanel({
  groupId,
  members,
  currentUserId,
  onClose,
  onCreated,
}: {
  groupId: string;
  members: Member[];
  currentUserId: string;
  onClose: () => void;
  onCreated: (expense: { id: string; split_mode: SplitMode }) => void;
}) {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set(members.map((m) => m.user_id)));
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, string>>(Object.fromEntries(members.map((m) => [m.user_id, "1"])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleParticipant(id: string) {
    setParticipantIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function submit() {
    setError("");
    const totalCents = Math.round(Number(amount) * 100);
    if (!totalCents || totalCents <= 0) {
      setError("Enter a total amount greater than zero.");
      return;
    }
    if (!description.trim()) {
      setError("Enter a description.");
      return;
    }

    const payload: Record<string, unknown> = {
      description: description.trim(),
      total_amount_cents: totalCents,
      paid_by: paidBy,
      occurred_on: occurredOn,
      split_mode: splitMode,
    };

    if (splitMode === "equal") {
      if (participantIds.size === 0) {
        setError("Select at least one participant.");
        return;
      }
      payload.participant_ids = [...participantIds];
    } else if (splitMode === "exact") {
      const exactShares = members
        .filter((m) => Number(exactAmounts[m.user_id]) > 0)
        .map((m) => ({ user_id: m.user_id, exact_amount_cents: Math.round(Number(exactAmounts[m.user_id]) * 100) }));
      if (exactShares.length === 0) {
        setError("Enter an amount for at least one person.");
        return;
      }
      payload.exact_shares = exactShares;
    } else if (splitMode === "weighted") {
      const weightedShares = members
        .filter((m) => Number(weights[m.user_id]) > 0)
        .map((m) => ({ user_id: m.user_id, weight: Number(weights[m.user_id]) }));
      if (weightedShares.length === 0) {
        setError("Enter a weight for at least one person.");
        return;
      }
      payload.weighted_shares = weightedShares;
    }

    setSaving(true);
    const res = await fetch(`/api/groups/${groupId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(body.error?.message ?? "Couldn't create that expense. Try again.");
      return;
    }
    toast(splitMode === "itemised" ? "Now assign items in the receipt editor." : "Expense added — confirm it to lock in shares.");
    onCreated(body.expense);
  }

  return (
    <div className="fixed inset-0 z-[250] flex justify-end bg-black/60">
      <div className="h-full w-full max-w-[460px] overflow-y-auto border-l border-border bg-bg p-7">
        <div className="mb-5 flex items-center justify-between">
          <div className="text-xl font-extrabold">Add expense</div>
          <button onClick={onClose} aria-label="Close" className="text-text-dim hover:text-text">
            <X size={18} />
          </button>
        </div>

        <FieldLabel htmlFor="expDescription" required>
          Description
        </FieldLabel>
        <Input id="expDescription" className="mb-3.5" value={description} onChange={(e) => setDescription(e.target.value)} />

        <FieldLabel htmlFor="expAmount" required>
          Total amount
        </FieldLabel>
        <Input id="expAmount" inputMode="decimal" placeholder="0.00" className="mb-3.5 text-xl font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} />

        <FieldLabel htmlFor="paidBy">Paid by</FieldLabel>
        <Select id="paidBy" className="mb-3.5" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.user_id === currentUserId ? "You" : m.full_name}
            </option>
          ))}
        </Select>

        <FieldLabel htmlFor="expDate">Date</FieldLabel>
        <Input id="expDate" type="date" className="mb-4" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />

        <FieldLabel>Split mode</FieldLabel>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(
            [
              { key: "equal", label: "Split equally" },
              { key: "itemised", label: "Itemised" },
              { key: "exact", label: "Custom amounts" },
              { key: "weighted", label: "Weighted" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setSplitMode(m.key)}
              className={
                "rounded-[9px] border py-2.5 text-[12.5px] font-semibold " +
                (splitMode === m.key ? "border-gold bg-gold/10 text-gold" : "border-border text-text-dim")
              }
            >
              {m.label}
            </button>
          ))}
        </div>

        {splitMode === "equal" && (
          <div className="mb-4">
            <FieldLabel>Split among</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => toggleParticipant(m.user_id)}
                  className={
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold " +
                    (participantIds.has(m.user_id) ? "border-gold bg-gold/10 text-gold" : "border-border text-text-dim")
                  }
                >
                  <Avatar userId={m.user_id} name={m.user_id === currentUserId ? "You" : m.full_name} size={18} />
                  {m.user_id === currentUserId ? "You" : m.full_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {splitMode === "exact" && (
          <div className="mb-4">
            <FieldLabel>Amount per person</FieldLabel>
            {members.map((m) => (
              <div key={m.user_id} className="mb-2 flex items-center gap-2">
                <span className="w-28 text-[13px] text-text-dim">{m.user_id === currentUserId ? "You" : m.full_name}</span>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={exactAmounts[m.user_id] ?? ""}
                  onChange={(e) => setExactAmounts((prev) => ({ ...prev, [m.user_id]: e.target.value }))}
                />
              </div>
            ))}
            <div className="text-[11px] text-text-faint">Amounts must add up to the total exactly — you&apos;ll get a clear error at confirm if they don&apos;t.</div>
          </div>
        )}

        {splitMode === "weighted" && (
          <div className="mb-4">
            <FieldLabel>Weight per person</FieldLabel>
            {members.map((m) => (
              <div key={m.user_id} className="mb-2 flex items-center gap-2">
                <span className="w-28 text-[13px] text-text-dim">{m.user_id === currentUserId ? "You" : m.full_name}</span>
                <Input
                  inputMode="decimal"
                  value={weights[m.user_id] ?? ""}
                  onChange={(e) => setWeights((prev) => ({ ...prev, [m.user_id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        {splitMode === "itemised" && (
          <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3.5 text-[12.5px] text-text-dim">
            You&apos;ll assign line items to each person and set tax/tip allocation in the receipt editor next.
          </div>
        )}

        {error && <div className="mb-4 text-[12.5px] text-coral">{error}</div>}

        <div className="mt-2 flex flex-col gap-2">
          <Button onClick={submit} loading={saving}>
            {splitMode === "itemised" ? "Continue to receipt editor" : "Add expense"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
