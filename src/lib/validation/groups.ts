import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Give the group a name.").max(100),
});

export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid email address."),
});

export const splitModeSchema = z.enum(["equal", "itemised", "exact", "weighted"]);
export const allocationModeSchema = z.enum(["proportional", "equal"]);

const lineItemSchema = z.object({
  item_name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().default(1),
  unit_price_cents: z.number().int().nonnegative(),
  assigned_user_ids: z.array(z.uuid()).default([]),
});

const exactShareSchema = z.object({
  user_id: z.uuid(),
  exact_amount_cents: z.number().int().nonnegative(),
});

const weightedShareSchema = z.object({
  user_id: z.uuid(),
  weight: z.number().positive(),
});

export const createGroupExpenseSchema = z
  .object({
    description: z.string().trim().min(1, "Description is required.").max(200),
    total_amount_cents: z.number().int().positive("Total must be greater than zero."),
    paid_by: z.uuid(),
    occurred_on: z.iso.date(),
    split_mode: splitModeSchema,
    participant_ids: z.array(z.uuid()).optional(),
    tax_amount_cents: z.number().int().nonnegative().default(0),
    tip_amount_cents: z.number().int().nonnegative().default(0),
    tax_allocation: allocationModeSchema.default("proportional"),
    tip_allocation: allocationModeSchema.default("proportional"),
    discount_amount_cents: z.number().int().nonnegative().default(0),
    receipt_image_path: z.string().max(500).nullable().optional(),
    items: z.array(lineItemSchema).optional(),
    exact_shares: z.array(exactShareSchema).optional(),
    weighted_shares: z.array(weightedShareSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.split_mode === "equal") return (data.participant_ids?.length ?? 0) >= 1;
      if (data.split_mode === "itemised") return (data.items?.length ?? 0) >= 1;
      if (data.split_mode === "exact") return (data.exact_shares?.length ?? 0) >= 1;
      if (data.split_mode === "weighted") return (data.weighted_shares?.length ?? 0) >= 1;
      return false;
    },
    { message: "This split mode needs its matching participant data before it can be saved." }
  );

export const confirmGroupExpenseSchema = z.object({
  expense_id: z.uuid(),
});

export const settleUpSchema = z.object({
  to_user_id: z.uuid(),
  amount_cents: z.number().int().positive(),
  note: z.string().trim().max(300).optional(),
  related_expense_ids: z.array(z.uuid()).optional().default([]),
});
