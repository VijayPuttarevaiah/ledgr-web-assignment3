"use client";

import { useState } from "react";
import { UserPlus, Receipt as ReceiptIcon } from "lucide-react";
import type { GroupDetail } from "@/lib/groups";
import { Card, CardLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { formatCents } from "@/lib/money";
import { useToast } from "@/components/providers/toast-context";
import { useConfirm } from "@/components/providers/confirm-context";
import { InviteDialog } from "./invite-dialog";

const SPLIT_MODE_LABEL: Record<string, string> = {
  equal: "Split equally",
  itemised: "Itemised",
  exact: "Custom amounts",
  weighted: "Weighted",
};

export function GroupDetailView({
  detail,
  onAddExpense,
  onOpenReceipt,
  onChanged,
}: {
  detail: GroupDetail;
  onAddExpense: () => void;
  onOpenReceipt: (expenseId: string) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const nameById = new Map(detail.members.map((m) => [m.user_id, m.full_name]));

  async function settleUp(counterpartyId: string, cents: number) {
    const counterpartyName = nameById.get(counterpartyId) ?? "this person";
    const ok = await confirm({
      title: `Mark ${formatCents(cents)} as settled with ${counterpartyName}?`,
      body: "This records the debt as paid in LEDGR. It doesn't move real money — make sure you've actually settled up first.",
      confirmLabel: "Yes, mark as settled",
    });
    if (!ok) return;
    const res = await fetch(`/api/groups/${detail.group.id}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_user_id: counterpartyId, amount_cents: cents }),
    });
    if (res.ok) {
      toast("Marked as settled.");
      onChanged();
    } else {
      toast("Couldn't record that settlement. Try again.", { tone: "error" });
    }
  }

  async function confirmDraft(expenseId: string) {
    setConfirming(expenseId);
    const res = await fetch(`/api/groups/${detail.group.id}/expenses/${expenseId}/confirm`, { method: "POST" });
    const body = await res.json();
    setConfirming(null);
    if (res.ok) {
      toast("Split confirmed — everyone's share is locked in.");
      onChanged();
    } else {
      toast(body.error?.message ?? "Couldn't confirm this split.", { tone: "error" });
    }
  }

  return (
    <div>
      <div className="mb-0.5 text-[22px] font-extrabold">{detail.group.name}</div>
      <div className="mb-4 flex items-center gap-3 text-[12.5px] text-text-faint">
        <span>
          {detail.members.length} member{detail.members.length === 1 ? "" : "s"} · {detail.expenses.length} expense
          {detail.expenses.length === 1 ? "" : "s"}
        </span>
        <button onClick={() => setInviteOpen(true)} className="flex items-center gap-1 text-gold hover:underline">
          <UserPlus size={12} /> Invite
        </button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-8">
            {detail.balances.length === 0 ? (
              <div>
                <CardLabel>Balance</CardLabel>
                <div className="font-bold text-text-dim">All settled up</div>
              </div>
            ) : (
              detail.balances.map((b) => (
                <div key={b.counterpartyId}>
                  <CardLabel>{b.netCents > 0 ? `${nameById.get(b.counterpartyId)} owes you` : `You owe ${nameById.get(b.counterpartyId)}`}</CardLabel>
                  <MoneyText cents={Math.abs(b.netCents)} direction={b.netCents > 0 ? "in" : "out"} className="text-lg font-extrabold" />
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2.5">
            {detail.balances
              .filter((b) => b.netCents < 0)
              .map((b) => (
                <Button key={b.counterpartyId} onClick={() => settleUp(b.counterpartyId, -b.netCents)}>
                  Settle up with {nameById.get(b.counterpartyId)}
                </Button>
              ))}
            <Button variant="ghost" onClick={onAddExpense}>
              + Add expense
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[1.4fr_1fr_1.3fr_90px_100px] gap-2 border-b border-border px-4 py-2.5 text-[11px] text-text-faint uppercase">
          <div>Expense</div>
          <div>Paid by</div>
          <div>Split mode</div>
          <div className="text-right">Total</div>
          <div className="text-right">Your share</div>
        </div>
        {detail.expenses.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-text-dim">
            No expenses yet.{" "}
            <button onClick={onAddExpense} className="text-gold hover:underline">
              Add the first one →
            </button>
          </div>
        ) : (
          detail.expenses.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[1.4fr_1fr_1.3fr_90px_100px] items-center gap-2 border-b border-border px-4 py-3 text-[13.5px] last:border-b-0"
            >
              <div>
                <button
                  onClick={() => (e.split_mode === "itemised" ? onOpenReceipt(e.id) : undefined)}
                  className={`font-bold ${e.split_mode === "itemised" ? "cursor-pointer text-left hover:underline" : "cursor-default text-left"}`}
                >
                  {e.description}
                </button>
                <div className="flex items-center gap-1.5 text-[11.5px] text-text-faint">
                  {e.occurred_on}
                  {e.split_mode === "itemised" && (
                    <button onClick={() => onOpenReceipt(e.id)} className="flex items-center gap-1 text-gold hover:underline">
                      <ReceiptIcon size={11} /> view receipt
                    </button>
                  )}
                  {e.status === "draft" && <span className="rounded-full border border-gold/40 px-1.5 py-0.5 text-gold">draft</span>}
                </div>
              </div>
              <div className="text-text-dim">{nameById.get(e.paid_by) ?? "—"}</div>
              <div>
                <span className="rounded-full bg-teal/15 px-2.5 py-[3px] text-[11.5px] font-bold text-teal">
                  {SPLIT_MODE_LABEL[e.split_mode]}
                </span>
              </div>
              <div className="text-right font-bold">{formatCents(e.total_amount_cents)}</div>
              <div className="flex items-center justify-end gap-2 text-right font-bold text-coral">
                {e.your_share_cents !== null ? (
                  formatCents(e.your_share_cents)
                ) : e.status === "draft" && e.split_mode !== "itemised" ? (
                  <Button size="sm" onClick={() => confirmDraft(e.id)} loading={confirming === e.id}>
                    Confirm
                  </Button>
                ) : (
                  "—"
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {inviteOpen && <InviteDialog groupId={detail.group.id} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
