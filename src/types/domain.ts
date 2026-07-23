import type { Tables } from "./database";

// Postgres CHECK constraints (see supabase/migrations) aren't reflected as
// literal unions by `supabase gen types`, so the app-facing narrow types
// live here instead of hand-editing the generated database.ts.
export type SplitMode = "equal" | "itemised" | "exact" | "weighted";
export type AllocationMode = "proportional" | "equal";
export type TransactionType = "income" | "expense";
export type RecurrenceFrequency = "weekly" | "monthly";
export type GroupExpenseStatus = "draft" | "confirmed";
export type SettlementStatus = "pending" | "settled";
export type GroupRole = "owner" | "member";
export type InviteStatus = "pending" | "accepted" | "expired";
export type AIUsageFeature = "categorization" | "ocr" | "narrative";

export type Profile = Tables<"profiles">;
export type Category = Tables<"categories">;
export type Transaction = Omit<Tables<"transactions">, "type"> & { type: TransactionType };
export type RecurringRule = Omit<Tables<"recurring_rules">, "type" | "frequency"> & {
  type: TransactionType;
  frequency: RecurrenceFrequency;
};
export type Budget = Tables<"budgets">;
export type Group = Tables<"groups">;
export type GroupMember = Omit<Tables<"group_members">, "role"> & { role: GroupRole };
export type GroupInvite = Omit<Tables<"group_invites">, "status"> & { status: InviteStatus };
export type GroupExpense = Omit<
  Tables<"group_expenses">,
  "split_mode" | "status" | "tax_allocation" | "tip_allocation"
> & {
  split_mode: SplitMode;
  status: GroupExpenseStatus;
  tax_allocation: AllocationMode;
  tip_allocation: AllocationMode;
};
export type GroupExpenseItem = Tables<"group_expense_items">;
export type GroupExpenseItemAssignment = Tables<"group_expense_item_assignments">;
export type GroupExpenseShare = Tables<"group_expense_shares">;
export type Settlement = Omit<Tables<"settlements">, "status"> & { status: SettlementStatus };
