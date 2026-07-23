"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Receipt as ReceiptIcon, Users, X, LogOut } from "lucide-react";
import type { GroupDetail } from "@/lib/groups";
import { Card, CardLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { Avatar } from "@/components/ui/avatar";
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
  currentUserId,
  onAddExpense,
  onOpenReceipt,
  onChanged,
}: {
  detail: GroupDetail;
  currentUserId: string;
  onAddExpense: () => void;
  onOpenReceipt: (expenseId: string) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const nameById = new Map(detail.members.map((m) => [m.user_id, m.full_name]));
  const isOwner = detail.members.some((m) => m.user_id === currentUserId && m.role === "owner");

  async function removeMember(memberId: string, isSelf: boolean) {
    const memberName = isSelf ? "the group" : (nameById.get(memberId) ?? "this member");
    const ok = await confirm({
      title: isSelf ? "Leave this group?" : `Remove ${memberName}?`,
      body: isSelf
        ? "You'll lose access to this group's expenses and balances. Existing history stays intact for everyone else."
        : `${memberName} will lose access to this group. Their past confirmed expenses stay in the group's history.`,
      confirmLabel: isSelf ? "Leave group" : "Remove",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/groups/${detail.group.id}/members/${memberId}`, { method: "DELETE" });
    if (res.ok) {
      toast(isSelf ? "You left the group." : `${memberName} was removed.`);
      if (isSelf) {
        router.push("/split");
        router.refresh();
      } else {
        onChanged();
      }
    } else {
      const body = await res.json();
      toast(body.error?.message ?? "Couldn't do that. Try again.", { tone: "error" });
    }
  }

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
      <div className="relative mb-4 flex items-center gap-3 text-[12.5px] text-text-faint">
        <button onClick={() => setMembersOpen((v) => !v)} className="flex items-center gap-1 hover:text-text-dim">
          <Users size={12} />
          {detail.members.length} member{detail.members.length === 1 ? "" : "s"}
        </button>
        <span>
          · {detail.expenses.length} expense{detail.expenses.length === 1 ? "" : "s"}
        </span>
        <button onClick={() => setInviteOpen(true)} className="flex items-center gap-1 text-gold hover:underline">
          <UserPlus size={12} /> Invite
        </button>

        {membersOpen && (
          <div className="absolute top-full left-0 z-20 mt-2 w-72 rounded-xl border border-border bg-surface p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wide text-text-faint uppercase">Members</span>
              <button onClick={() => setMembersOpen(false)} aria-label="Close" className="text-text-faint hover:text-text-dim">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {detail.members.map((m) => {
                const self = m.user_id === currentUserId;
                return (
                  <div key={m.user_id} className="flex items-center justify-between rounded-lg px-1.5 py-1.5 hover:bg-surface-2">
                    <div className="flex items-center gap-2">
                      <Avatar userId={m.user_id} name={m.full_name} size={22} />
                      <div>
                        <div className="text-[13px] font-semibold text-text">{self ? "You" : m.full_name}</div>
                        <div className="text-[10.5px] text-text-faint capitalize">{m.role}</div>
                      </div>
                    </div>
                    {self ? (
                      <button
                        onClick={() => removeMember(m.user_id, true)}
                        title="Leave group"
                        aria-label="Leave group"
                        className="text-text-faint hover:text-coral"
                      >
                        <LogOut size={14} />
                      </button>
                    ) : (
                      isOwner && (
                        <button
                          onClick={() => removeMember(m.user_id, false)}
                          title={`Remove ${m.full_name}`}
                          aria-label={`Remove ${m.full_name}`}
                          className="text-text-faint hover:text-coral"
                        >
                          <X size={14} />
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
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

      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <div className="grid min-w-[560px] grid-cols-[1.4fr_1fr_1.3fr_90px_100px] gap-2 border-b border-border px-4 py-2.5 text-[11px] text-text-faint uppercase">
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
              className="grid min-w-[560px] grid-cols-[1.4fr_1fr_1.3fr_90px_100px] items-center gap-2 border-b border-border px-4 py-3 text-[13.5px] last:border-b-0"
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
