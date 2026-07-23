import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AIUsageFeature } from "@/types/domain";
import { logger } from "@/lib/logger";

/** Powers the §4.1 spend cap — summed across all users/features for the current calendar month. */
export async function getMonthlySpendUsd(): Promise<number> {
  const admin = createAdminClient();
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from("ai_usage_log")
    .select("estimated_cost_usd")
    .gte("created_at", startOfMonth.toISOString());
  if (error) {
    logger.error({ err: error.message }, "Failed to read ai_usage_log for spend cap check");
    return 0;
  }
  return data.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
}

/** Inserted only server-side, via the service-role key — never from client code (§5). */
export async function logAIUsage(userId: string, feature: AIUsageFeature, model: string, estimatedCostUsd: number) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("ai_usage_log")
    .insert({ user_id: userId, feature, model, estimated_cost_usd: estimatedCostUsd });
  if (error) {
    logger.error({ err: error.message, feature }, "Failed to record ai_usage_log entry");
  }
}
