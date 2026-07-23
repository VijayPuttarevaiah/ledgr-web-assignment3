import { splitEvenly } from "./money";

export type SplitMode = "equal" | "exact" | "weighted" | "itemised";
export type AllocationMode = "proportional" | "equal";

/** §6.1 — total / n, integer division; leftover cents go to whoever paid. */
export function splitEqual(
  totalCents: number,
  participantIds: string[],
  paidBy: string
): Record<string, number> {
  if (participantIds.length === 0) throw new Error("splitEqual: no participants");
  const { base, remainder } = splitEvenly(totalCents, participantIds.length);
  const result: Record<string, number> = {};
  for (const id of participantIds) result[id] = base;
  if (!(paidBy in result)) result[paidBy] = 0;
  result[paidBy] += remainder;
  return result;
}

/** §6.1 — exact amounts must reconcile to the total before a split can be confirmed. */
export function validateExactSplit(
  totalCents: number,
  exactAmounts: Record<string, number>
): { valid: boolean; sum: number; deltaCents: number } {
  const sum = Object.values(exactAmounts).reduce((a, b) => a + b, 0);
  return { valid: sum === totalCents, sum, deltaCents: totalCents - sum };
}

export interface WeightedParticipant {
  userId: string;
  weight: number;
}

/**
 * §6.1 — share = round(total * weight / sumWeights). Rounding remainder goes
 * to the largest-weight participant; ties break to whoever paid.
 */
export function splitWeighted(
  totalCents: number,
  participants: WeightedParticipant[],
  paidBy: string
): Record<string, number> {
  if (participants.length === 0) throw new Error("splitWeighted: no participants");
  const sumWeights = participants.reduce((a, p) => a + p.weight, 0);
  if (sumWeights <= 0) throw new Error("splitWeighted: total weight must be positive");

  const result: Record<string, number> = {};
  let allocated = 0;
  for (const p of participants) {
    const share = Math.round((totalCents * p.weight) / sumWeights);
    result[p.userId] = share;
    allocated += share;
  }

  const remainder = totalCents - allocated;
  if (remainder !== 0) {
    const maxWeight = Math.max(...participants.map((p) => p.weight));
    const tied = participants.filter((p) => p.weight === maxWeight);
    const recipient = tied.find((p) => p.userId === paidBy) ?? tied[0];
    result[recipient.userId] += remainder;
  }
  return result;
}

export interface LineItemInput {
  id: string;
  lineTotalCents: number; // quantity * unit_price_cents, pre-computed by the caller
  assignedUserIds: string[];
}

/**
 * §6.1 — for each line item, split its line total evenly among everyone
 * assigned to it; any remainder from an uneven division goes to the first
 * person assigned to that specific item (not globally first).
 */
export function splitItemised(items: LineItemInput[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    if (item.assignedUserIds.length === 0) continue;
    const { base, remainder } = splitEvenly(item.lineTotalCents, item.assignedUserIds.length);
    item.assignedUserIds.forEach((userId, idx) => {
      result[userId] = (result[userId] ?? 0) + base + (idx === 0 ? remainder : 0);
    });
  }
  return result;
}

export interface TaxTipDiscountInput {
  itemSubtotalsByUser: Record<string, number>;
  billSubtotalCents: number;
  discountAmountCents: number;
  taxAmountCents: number;
  taxAllocation: AllocationMode;
  tipAmountCents: number;
  tipAllocation: AllocationMode;
  totalAmountCents: number;
  paidBy: string;
}

/**
 * §6.2 — proportional discount, then tax and tip (each independently
 * proportional-or-equal), then round once per participant and push any
 * final ±cent drift onto whoever paid so the sum always reconciles exactly
 * to total_amount_cents (§6.2 step 6 — the invariant that must never break).
 */
export function allocateTaxTipDiscount(input: TaxTipDiscountInput): Record<string, number> {
  const participantIds = Object.keys(input.itemSubtotalsByUser);
  if (participantIds.length === 0) throw new Error("allocateTaxTipDiscount: no participants");
  const n = participantIds.length;
  // A bill with zero assigned subtotal (e.g. a tax/tip-only adjustment) has
  // no meaningful "share of the bill" ratio, so proportional allocation
  // falls back to equal in that degenerate case only.
  const billSubtotal = input.billSubtotalCents;

  const rounded: Record<string, number> = {};
  let allocated = 0;
  for (const id of participantIds) {
    const itemSubtotal = input.itemSubtotalsByUser[id];
    const ratio = billSubtotal > 0 ? itemSubtotal / billSubtotal : 1 / n;
    const discountShare = input.discountAmountCents * ratio;
    const adjustedSubtotal = itemSubtotal - discountShare;
    const taxShare =
      input.taxAllocation === "proportional" ? input.taxAmountCents * ratio : input.taxAmountCents / n;
    const tipShare =
      input.tipAllocation === "proportional" ? input.tipAmountCents * ratio : input.tipAmountCents / n;
    const share = Math.round(adjustedSubtotal + taxShare + tipShare);
    rounded[id] = share;
    allocated += share;
  }

  const remainder = input.totalAmountCents - allocated;
  if (remainder !== 0) {
    if (!(input.paidBy in rounded)) rounded[input.paidBy] = 0;
    rounded[input.paidBy] += remainder;
  }
  return rounded;
}

export function sumShares(shares: Record<string, number>): number {
  return Object.values(shares).reduce((a, b) => a + b, 0);
}
