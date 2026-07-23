import { z } from "zod";

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  default_currency: z.string().trim().length(3).optional(),
  date_format: z.string().trim().min(1).max(30).optional(),
  default_payment_method: z.string().trim().min(1).max(60).optional(),
  notify_email_digest: z.boolean().optional(),
  notify_push: z.boolean().optional(),
  notify_settlement_reminders: z.boolean().optional(),
});

export const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE", { error: "Type DELETE to confirm." }),
});
