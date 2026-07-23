import { z } from "zod";

export const upsertBudgetSchema = z.object({
  category_id: z.uuid(),
  month: z.iso.date("Month must be the first of the month, e.g. 2026-07-01."),
  base_amount_cents: z.number().int().nonnegative(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #f0a83c."),
  icon: z.string().trim().min(1).max(40).default("Tag"),
});

export const createRecurringRuleSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount_cents: z.number().int().positive(),
  description: z.string().trim().min(1).max(200),
  category_id: z.uuid().nullable().optional(),
  payment_method: z.string().trim().max(60).nullable().optional(),
  frequency: z.enum(["weekly", "monthly"]),
  next_run_on: z.iso.date(),
});
