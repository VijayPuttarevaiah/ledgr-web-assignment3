import { z } from "zod";

export const transactionTypeSchema = z.enum(["income", "expense"]);

export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  amount_cents: z.number().int().positive("Amount must be greater than zero."),
  description: z.string().trim().min(1, "Description is required.").max(200),
  category_id: z.uuid().nullable().optional(),
  payment_method: z.string().trim().max(60).nullable().optional(),
  occurred_on: z.iso.date("Enter a valid date."),
  is_recurring: z.boolean().optional().default(false),
  recurring_frequency: z.enum(["weekly", "monthly"]).optional(),
  receipt_image_path: z.string().max(500).nullable().optional(),
  ai_category_confidence: z.number().min(0).max(100).nullable().optional(),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const bulkUpdateTransactionsSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Select at least one transaction."),
  category_id: z.uuid().nullable().optional(),
  delete: z.boolean().optional(),
});

export const transactionsQuerySchema = z.object({
  filter: z.enum(["all", "income", "expenses", "recurring", "shared"]).optional().default("all"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
