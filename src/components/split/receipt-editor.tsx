"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check, Loader2, Upload, FileDown, RotateCcw } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formatCents } from "@/lib/money";
import { splitItemised, allocateTaxTipDiscount } from "@/lib/split-math";
import { useToast } from "@/components/providers/toast-context";
import { useConfirm } from "@/components/providers/confirm-context";
import { aiClientFlags } from "@/lib/ai/client-flags";
import { createClient } from "@/lib/supabase/client";
import { buildReceiptPath, RECEIPTS_BUCKET } from "@/lib/supabase/storage-shared";

interface Member {
  user_id: string;
  full_name: string;
}
interface Item {
  id: string;
  item_name: string;
  quantity: number;
  unit_price_cents: number;
  assigned_user_ids: string[];
}
type AllocationMode = "proportional" | "equal";

export function ReceiptEditor({
  expenseId,
  groupId,
  members,
  onClose,
}: {
  expenseId: string;
  groupId: string;
  members: Member[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [expense, setExpense] = useState<{
    description: string;
    occurred_on: string;
    total_amount_cents: number;
    tax_amount_cents: number;
    tip_amount_cents: number;
    tax_allocation: AllocationMode;
    tip_allocation: AllocationMode;
    discount_amount_cents: number;
    status: "draft" | "confirmed";
  } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [activeMemberId, setActiveMemberId] = useState(members[0]?.user_id ?? "");
  const [newItem, setNewItem] = useState({ name: "", qty: "1", price: "" });
  const [ocrState, setOcrState] = useState<"idle" | "scanning" | "done" | "failed">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/groups/${groupId}/expenses/${expenseId}`);
      const body = await res.json();
      if (cancelled) return;
      if (res.ok) {
        setExpense(body.expense);
        setItems(body.items);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, expenseId]);

  const nameById = new Map(members.map((m) => [m.user_id, m.full_name]));

  const preview = useMemo(() => {
    if (!expense) return null;
    const lineItems = items.map((it) => ({
      id: it.id,
      lineTotalCents: Math.round(it.quantity * it.unit_price_cents),
      assignedUserIds: it.assigned_user_ids,
    }));
    const billSubtotalCents = lineItems.reduce((a, li) => a + li.lineTotalCents, 0);
    const participantsWithItems = [...new Set(lineItems.flatMap((li) => li.assignedUserIds))];
    if (participantsWithItems.length === 0) {
      return { subtotal: billSubtotalCents, perPerson: [] as { userId: string; cents: number }[] };
    }
    const itemSubtotalsByUser = splitItemised(lineItems);
    for (const uid of participantsWithItems) if (!(uid in itemSubtotalsByUser)) itemSubtotalsByUser[uid] = 0;
    const finalShares = allocateTaxTipDiscount({
      itemSubtotalsByUser,
      billSubtotalCents,
      discountAmountCents: expense.discount_amount_cents,
      taxAmountCents: expense.tax_amount_cents,
      taxAllocation: expense.tax_allocation,
      tipAmountCents: expense.tip_amount_cents,
      tipAllocation: expense.tip_allocation,
      totalAmountCents: expense.total_amount_cents,
      paidBy: participantsWithItems[0],
    });
    return {
      subtotal: billSubtotalCents,
      perPerson: Object.entries(finalShares).map(([userId, cents]) => ({ userId, cents })),
    };
  }, [expense, items]);

  async function toggleAssign(itemId: string, userId: string) {
    if (expense?.status === "confirmed") return;
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const currentlyAssigned = item.assigned_user_ids.includes(userId);
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              assigned_user_ids: currentlyAssigned
                ? it.assigned_user_ids.filter((id) => id !== userId)
                : [...it.assigned_user_ids, userId],
            }
          : it
      )
    );
    await fetch(`/api/groups/${groupId}/expenses/${expenseId}/items/${itemId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, assigned: !currentlyAssigned }),
    });
  }

  async function addItem() {
    const price = Math.round(Number(newItem.price) * 100);
    const qty = Number(newItem.qty) || 1;
    if (!newItem.name.trim() || !price) return;
    const res = await fetch(`/api/groups/${groupId}/expenses/${expenseId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: newItem.name.trim(), quantity: qty, unit_price_cents: price }),
    });
    const body = await res.json();
    if (res.ok) {
      setItems((prev) => [...prev, body.item]);
      setNewItem({ name: "", qty: "1", price: "" });
    }
  }

  async function removeItem(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    await fetch(`/api/groups/${groupId}/expenses/${expenseId}/items/${itemId}`, { method: "DELETE" });
  }

  async function patchExpense(patch: Record<string, unknown>) {
    setExpense((prev) => (prev ? { ...prev, ...patch } : prev));
    await fetch(`/api/groups/${groupId}/expenses/${expenseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function handleReceiptFile(file: File) {
    if (!aiClientFlags.ocr) {
      setOcrState("scanning");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const path = buildReceiptPath(user.id, file.name);
      const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, file);
      if (!error) await patchExpense({ receipt_image_path: path });
      setOcrState(error ? "failed" : "done");
      return;
    }
    setOcrState("scanning");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/receipts/parse", { method: "POST", body: formData });
    const body = await res.json();
    if (!body.enabled || !body.success) {
      setOcrState("failed");
      return;
    }
    setOcrState("done");
    await patchExpense({ receipt_image_path: body.receipt_image_path });
    for (const li of body.line_items ?? []) {
      const itemRes = await fetch(`/api/groups/${groupId}/expenses/${expenseId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_name: li.item_name, quantity: li.quantity || 1, unit_price_cents: li.unit_price_cents }),
      });
      const itemBody = await itemRes.json();
      if (itemRes.ok) setItems((prev) => [...prev, itemBody.item]);
    }
  }

  async function requestConfirm() {
    const ok = await confirm({
      title: "Confirm this split?",
      body: "This locks in each person's share and adds it straight to their personal ledger. You can reopen it for edits within 24 hours if something looks off.",
      confirmLabel: "Confirm split",
    });
    if (!ok) return;
    const res = await fetch(`/api/groups/${groupId}/expenses/${expenseId}/confirm`, { method: "POST" });
    const body = await res.json();
    if (res.ok) {
      setExpense((prev) => (prev ? { ...prev, status: "confirmed" } : prev));
      toast("Split confirmed — everyone's share is locked in.");
    } else {
      toast(body.error?.message ?? "Couldn't confirm this split.", { tone: "error" });
    }
  }

  async function requestReopen() {
    const res = await fetch(`/api/groups/${groupId}/expenses/${expenseId}/reopen`, { method: "POST" });
    const body = await res.json();
    if (res.ok) {
      setExpense((prev) => (prev ? { ...prev, status: "draft" } : prev));
      toast("Split reopened for edits.");
    } else {
      toast(body.error?.message ?? "Couldn't reopen this split.", { tone: "error" });
    }
  }

  const confirmed = expense?.status === "confirmed";

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-bg p-6">
        {loading || !expense ? (
          <div className="flex items-center justify-center py-20 text-text-dim">
            <Loader2 className="animate-spin-slow" size={20} />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-[19px] font-extrabold">Receipt editor</div>
                <div className="text-xs text-text-faint">
                  {expense.description} · {expense.occurred_on} · {formatCents(expense.total_amount_cents)} total
                  {confirmed && <span className="ml-1.5 font-bold text-teal">· Confirmed</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {members.map((m) => (
                  <Avatar key={m.user_id} userId={m.user_id} name={m.full_name} size={24} />
                ))}
                <button onClick={onClose} aria-label="Close" className="ml-1.5 text-text-dim hover:text-text">
                  <X size={18} />
                </button>
              </div>
            </div>

            {!confirmed && (
              <>
                <div className="mb-2 text-[11px] text-text-faint">Tap a person, then tap items to assign them (or unassign)</div>
                <div className="mb-3.5 flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <button
                      key={m.user_id}
                      onClick={() => setActiveMemberId(m.user_id)}
                      className={
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold " +
                        (activeMemberId === m.user_id ? "border-gold bg-gold/10 text-gold" : "border-border text-text-dim")
                      }
                    >
                      <Avatar userId={m.user_id} name={m.full_name} size={18} /> {m.full_name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="mb-4 overflow-hidden rounded-[10px] border border-border">
              <div className="grid grid-cols-[1.6fr_50px_70px_1.2fr_80px_30px] gap-2 border-b border-border px-3.5 py-2 text-[10.5px] text-text-faint uppercase">
                <div>Item</div>
                <div>Qty</div>
                <div>Unit</div>
                <div>Assigned to</div>
                <div className="text-right">Line total</div>
                <div />
              </div>
              {items.map((it) => (
                <div
                  key={it.id}
                  className="grid grid-cols-[1.6fr_50px_70px_1.2fr_80px_30px] items-center gap-2 border-b border-border px-3.5 py-2.5 text-[13px]"
                >
                  <div>{it.item_name}</div>
                  <div className="text-text-dim">{it.quantity}</div>
                  <div className="text-text-dim">{formatCents(it.unit_price_cents)}</div>
                  <div
                    role={confirmed ? undefined : "button"}
                    tabIndex={confirmed ? undefined : 0}
                    aria-label={confirmed ? undefined : `Toggle ${nameById.get(activeMemberId) ?? "selected person"} on ${it.item_name}`}
                    onClick={() => toggleAssign(it.id, activeMemberId)}
                    onKeyDown={(e) => {
                      if (!confirmed && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        toggleAssign(it.id, activeMemberId);
                      }
                    }}
                    className={`flex gap-1 ${confirmed ? "" : "cursor-pointer"}`}
                  >
                    {it.assigned_user_ids.length === 0 ? (
                      <span className="text-[11.5px] text-text-faint">tap to assign</span>
                    ) : (
                      it.assigned_user_ids.map((uid) => (
                        <Avatar key={uid} userId={uid} name={nameById.get(uid) ?? "?"} size={20} />
                      ))
                    )}
                  </div>
                  <div className="text-right font-bold">{formatCents(Math.round(it.quantity * it.unit_price_cents))}</div>
                  {!confirmed && (
                    <button onClick={() => removeItem(it.id)} aria-label={`Remove ${it.item_name}`} className="text-text-faint hover:text-coral">
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
              {!confirmed && (
                <div className="grid grid-cols-[1.6fr_50px_70px_1.2fr_80px_30px] items-center gap-2 px-3.5 py-2.5">
                  <Input placeholder="Item name" value={newItem.name} onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} />
                  <Input value={newItem.qty} onChange={(e) => setNewItem((p) => ({ ...p, qty: e.target.value }))} />
                  <Input placeholder="0.00" value={newItem.price} onChange={(e) => setNewItem((p) => ({ ...p, price: e.target.value }))} />
                  <div />
                  <Button size="sm" onClick={addItem}>
                    Add
                  </Button>
                  <div />
                </div>
              )}
            </div>

            {!confirmed && (
              <div className="mb-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleReceiptFile(e.target.files[0])}
                />
                {aiClientFlags.ocr ? (
                  <div
                    data-testid="receipt-ocr-dropzone"
                    role="button"
                    tabIndex={0}
                    aria-label="Upload a receipt photo to auto-fill line items"
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    className="cursor-pointer rounded-[10px] border border-dashed border-border bg-surface-2 p-3.5 text-center text-xs"
                  >
                    {ocrState === "scanning" ? (
                      <span className="flex items-center justify-center gap-2 text-gold">
                        <Loader2 size={14} className="animate-spin-slow" /> Reading receipt…
                      </span>
                    ) : ocrState === "failed" ? (
                      <span className="text-coral">Couldn&apos;t read that clearly — try another photo or add items manually.</span>
                    ) : (
                      <span className="flex items-center justify-center gap-2 text-text-dim">
                        <Upload size={14} /> Drop a bill photo to auto-fill line items
                      </span>
                    )}
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                    {ocrState === "done" ? "Receipt attached ✓" : "Attach receipt (optional)"}
                  </Button>
                )}
              </div>
            )}

            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 text-[11px] text-text-faint uppercase">Tax</div>
                <div className="flex gap-2">
                  <Input
                    disabled={confirmed}
                    value={(expense.tax_amount_cents / 100).toFixed(2)}
                    onChange={(e) => patchExpense({ tax_amount_cents: Math.round(Number(e.target.value) * 100) })}
                  />
                  <Select
                    disabled={confirmed}
                    value={expense.tax_allocation}
                    onChange={(e) => patchExpense({ tax_allocation: e.target.value })}
                  >
                    <option value="proportional">Proportional</option>
                    <option value="equal">Equal</option>
                  </Select>
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] text-text-faint uppercase">Tip</div>
                <div className="flex gap-2">
                  <Input
                    disabled={confirmed}
                    value={(expense.tip_amount_cents / 100).toFixed(2)}
                    onChange={(e) => patchExpense({ tip_amount_cents: Math.round(Number(e.target.value) * 100) })}
                  />
                  <Select
                    disabled={confirmed}
                    value={expense.tip_allocation}
                    onChange={(e) => patchExpense({ tip_allocation: e.target.value })}
                  >
                    <option value="proportional">Proportional</option>
                    <option value="equal">Equal</option>
                  </Select>
                </div>
              </div>
            </div>

            {preview && preview.perPerson.length > 0 && (
              <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {preview.perPerson.map((p) => (
                  <div key={p.userId} className="rounded-[10px] border-t-[3px] border border-border p-3" style={{ borderTopColor: "#f0a83c" }}>
                    <div className="mb-1 text-xs font-bold">{p.userId ? (nameById.get(p.userId) ?? "?") : "?"}</div>
                    <div className="text-lg font-extrabold">{formatCents(p.cents)}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2.5">
              <div className="flex gap-2.5">
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                {confirmed && (
                  <Button variant="ghost" onClick={requestReopen}>
                    <RotateCcw size={14} /> Reopen
                  </Button>
                )}
              </div>
              <div className="flex gap-2.5">
                <a href={`/api/groups/${groupId}/expenses/${expenseId}/pdf`} target="_blank" rel="noreferrer">
                  <Button variant="ghost">
                    <FileDown size={14} /> Generate PDF
                  </Button>
                </a>
                {!confirmed && (
                  <Button onClick={requestConfirm}>
                    <Check size={14} /> Confirm split
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

