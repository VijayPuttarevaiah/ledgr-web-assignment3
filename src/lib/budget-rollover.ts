/**
 * §6.3 — budget rollover.
 * Surplus (underspend) rolls forward capped at 50% of the category's base
 * amount; overspend never carries a deficit into the new month.
 */
export function computeRolloverCents(
  baseAmountCents: number,
  previousMonthActualSpendCents: number
): number {
  if (previousMonthActualSpendCents >= baseAmountCents) return 0;
  const surplus = baseAmountCents - previousMonthActualSpendCents;
  const cap = Math.floor(baseAmountCents * 0.5);
  return Math.min(surplus, cap);
}

export function effectiveBudgetCents(baseAmountCents: number, rolloverAmountCents: number): number {
  return baseAmountCents + rolloverAmountCents;
}
