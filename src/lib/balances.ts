export interface ShareRow {
  group_expense_id: string;
  user_id: string;
  computed_share_cents: number | null;
}
export interface ExpenseRow {
  id: string;
  group_id: string;
  paid_by: string;
  status: string;
}
export interface SettlementRow {
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount_cents: number;
  status: string;
}

export interface NetBalance {
  groupId: string;
  counterpartyId: string;
  /** Positive: counterparty owes this user. Negative: this user owes counterparty. */
  netCents: number;
}

/**
 * One balance-computation function shared by the Dashboard "owed to you"
 * tile and the Split Studio balance strip, so the two screens can never
 * silently disagree (§7.4 — "always current, no manual recalculation
 * trigger"). Walks every confirmed expense's locked-in shares plus every
 * settled settlement, netted per (group, counterparty) pair, from one
 * user's point of view.
 */
export function balancesForUser(
  shares: ShareRow[],
  expenses: ExpenseRow[],
  settlements: SettlementRow[],
  userId: string
): NetBalance[] {
  const expenseById = new Map(expenses.map((e) => [e.id, e]));
  const netTowardUser = new Map<string, number>(); // `${groupId}:${counterpartyId}` -> cents owed TO userId (negative = userId owes them)

  const adjust = (groupId: string, counterpartyId: string, deltaTowardUser: number) => {
    if (counterpartyId === userId) return;
    const key = `${groupId}:${counterpartyId}`;
    netTowardUser.set(key, (netTowardUser.get(key) ?? 0) + deltaTowardUser);
  };

  for (const share of shares) {
    const expense = expenseById.get(share.group_expense_id);
    if (!expense || expense.status !== "confirmed") continue;
    const cents = share.computed_share_cents ?? 0;
    if (expense.paid_by === userId && share.user_id !== userId) {
      adjust(expense.group_id, share.user_id, cents); // they owe the user their share
    } else if (share.user_id === userId && expense.paid_by !== userId) {
      adjust(expense.group_id, expense.paid_by, -cents); // the user owes the payer their share
    }
  }
  for (const s of settlements) {
    if (s.status !== "settled") continue;
    if (s.to_user_id === userId) adjust(s.group_id, s.from_user_id, -s.amount_cents); // they paid the user back
    if (s.from_user_id === userId) adjust(s.group_id, s.to_user_id, s.amount_cents); // the user paid them back
  }

  return [...netTowardUser.entries()]
    .filter(([, cents]) => cents !== 0)
    .map(([key, netCents]) => {
      const [groupId, counterpartyId] = key.split(":");
      return { groupId, counterpartyId, netCents };
    });
}
