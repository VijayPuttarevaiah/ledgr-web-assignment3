import { logger, type Logger } from "@/lib/logger";

export type AIFeature = "categorization" | "ocr" | "narrative";

export interface AIResolution {
  enabled: boolean;
  reason?: string;
}

const FEATURE_FLAG_ENV: Record<AIFeature, string> = {
  categorization: "AI_CATEGORIZATION_ENABLED",
  ocr: "AI_OCR_ENABLED",
  narrative: "AI_NARRATIVE_ENABLED",
};

const FEATURE_LABEL: Record<AIFeature, string> = {
  categorization: "Category suggestions",
  ocr: "Receipt scanning",
  narrative: "The AI monthly summary",
};

function isTrue(value: string | undefined): boolean {
  return value === "true";
}

// DECISIONS.md #OCR-vendor: OCR is implemented with Claude's native vision
// input rather than Google Cloud Vision (the guide's §3 explicitly invites
// this consolidation). GOOGLE_CLOUD_VISION_API_KEY stays in the env table
// as a documented, supported alternative — resolveAIFeatureFlags accepts
// either credential so a deployment can switch providers without touching
// this module.
function hasRequiredSecret(
  feature: AIFeature,
  env: NodeJS.ProcessEnv
): { ok: true } | { ok: false; missingVar: string } {
  if (feature === "ocr") {
    const hasClaude = Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.trim());
    const hasVision = Boolean(env.GOOGLE_CLOUD_VISION_API_KEY && env.GOOGLE_CLOUD_VISION_API_KEY.trim());
    return hasClaude || hasVision ? { ok: true } : { ok: false, missingVar: "ANTHROPIC_API_KEY" };
  }
  const key = env.ANTHROPIC_API_KEY;
  return key && key.trim().length > 0 ? { ok: true } : { ok: false, missingVar: "ANTHROPIC_API_KEY" };
}

/**
 * §4.2 steps 1-3 — the master switch, the per-feature switch, and secret
 * presence. Pure and synchronous on purpose: every AI-adjacent route handler
 * must call this (or `resolveAIFeature` below), never re-implement the
 * checks ad hoc, per the guide's explicit warning that ad hoc reimplementation
 * is exactly how kill switches grow inconsistent bugs.
 */
export function resolveAIFeatureFlags(
  feature: AIFeature,
  env: NodeJS.ProcessEnv = process.env,
  log: Pick<Logger, "warn"> = logger
): AIResolution {
  if (!isTrue(env.AI_FEATURES_ENABLED)) {
    return { enabled: false, reason: "AI features are turned off for this deployment." };
  }
  if (!isTrue(env[FEATURE_FLAG_ENV[feature]])) {
    return { enabled: false, reason: `${FEATURE_LABEL[feature]} is turned off.` };
  }
  const secret = hasRequiredSecret(feature, env);
  if (!secret.ok) {
    log.warn(
      `${FEATURE_FLAG_ENV[feature]}=true but ${secret.missingVar} is missing — ${feature} disabled`,
      { feature, missingVar: secret.missingVar }
    );
    return { enabled: false, reason: `${FEATURE_LABEL[feature]} isn't configured right now.` };
  }
  return { enabled: true };
}

export interface SpendCapDeps {
  /** Sums `ai_usage_log.estimated_cost_usd` for the current calendar month, across all users/features. */
  getMonthlySpendUsd: () => Promise<number>;
}

/**
 * Full §4.2 resolution algorithm, all four steps. This is the single
 * function every AI route handler calls, server-side, on every request.
 */
export async function resolveAIFeature(
  feature: AIFeature,
  deps: SpendCapDeps,
  env: NodeJS.ProcessEnv = process.env,
  log: Pick<Logger, "warn"> = logger
): Promise<AIResolution> {
  const flagResolution = resolveAIFeatureFlags(feature, env, log);
  if (!flagResolution.enabled) return flagResolution;

  const capRaw = env.AI_MONTHLY_BUDGET_USD;
  const capUsd = capRaw !== undefined && capRaw.trim() !== "" ? Number(capRaw) : undefined;
  if (capUsd !== undefined && Number.isFinite(capUsd)) {
    const spend = await deps.getMonthlySpendUsd();
    if (spend >= capUsd) {
      log.warn(
        `AI monthly budget of $${capUsd} reached (spent $${spend.toFixed(2)}) — all AI features disabled for the remainder of the month`,
        { feature, capUsd, spend }
      );
      return {
        enabled: false,
        reason: "This month's AI budget has been reached. AI features will resume next month.",
      };
    }
  }
  return { enabled: true };
}

/** The standardized disabled-envelope body every AI route returns with HTTP 200 (§4.5). */
export function disabledEnvelope(resolution: AIResolution) {
  return { enabled: false, reason: resolution.reason ?? "This feature is currently disabled." };
}
