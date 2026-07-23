import { describe, it, expect, vi } from "vitest";
import { resolveAIFeatureFlags, resolveAIFeature, disabledEnvelope } from "@/lib/ai/kill-switch";

const silentLogger = { warn: vi.fn() };

const fullyOnEnv = {
  AI_FEATURES_ENABLED: "true",
  AI_CATEGORIZATION_ENABLED: "true",
  AI_OCR_ENABLED: "true",
  AI_NARRATIVE_ENABLED: "true",
  ANTHROPIC_API_KEY: "sk-test-key",
  GOOGLE_CLOUD_VISION_API_KEY: "vision-test-key",
} as unknown as NodeJS.ProcessEnv;

describe("resolveAIFeatureFlags — §4.2 steps 1-3 (pure, synchronous)", () => {
  it("is OFF when the master switch is unset", () => {
    const result = resolveAIFeatureFlags("categorization", {} as NodeJS.ProcessEnv, silentLogger);
    expect(result.enabled).toBe(false);
  });

  it.each(["", "1", "TRUE", "  true  ", "yes", undefined])(
    "treats %j for AI_FEATURES_ENABLED as OFF — only the exact string 'true' counts",
    (value) => {
      const env = { ...fullyOnEnv, AI_FEATURES_ENABLED: value } as unknown as NodeJS.ProcessEnv;
      expect(resolveAIFeatureFlags("categorization", env, silentLogger).enabled).toBe(false);
    }
  );

  it("is OFF when the master switch is on but the specific feature flag is off", () => {
    const env = { ...fullyOnEnv, AI_OCR_ENABLED: "false" };
    expect(resolveAIFeatureFlags("ocr", env, silentLogger).enabled).toBe(false);
  });

  it("each per-feature switch is independent while master is on", () => {
    const env = { ...fullyOnEnv, AI_OCR_ENABLED: "false" };
    expect(resolveAIFeatureFlags("categorization", env, silentLogger).enabled).toBe(true);
    expect(resolveAIFeatureFlags("narrative", env, silentLogger).enabled).toBe(true);
    expect(resolveAIFeatureFlags("ocr", env, silentLogger).enabled).toBe(false);
  });

  it("is OFF and logs a warning when the required secret is missing, even with flags on", () => {
    const warn = vi.fn();
    const env = { ...fullyOnEnv, ANTHROPIC_API_KEY: "" };
    const result = resolveAIFeatureFlags("categorization", env, { warn });
    expect(result.enabled).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][1]).toMatch(/ANTHROPIC_API_KEY is missing/);
  });

  it("OCR accepts either ANTHROPIC_API_KEY or GOOGLE_CLOUD_VISION_API_KEY (documented vendor consolidation)", () => {
    const env = { ...fullyOnEnv, GOOGLE_CLOUD_VISION_API_KEY: "" };
    expect(resolveAIFeatureFlags("ocr", env, silentLogger).enabled).toBe(true);
  });

  it("is ON only when master + feature flag + secret all check out", () => {
    expect(resolveAIFeatureFlags("categorization", fullyOnEnv, silentLogger).enabled).toBe(true);
  });
});

describe("resolveAIFeature — §4.2 step 4, the monthly spend cap", () => {
  it("is OFF and logged when spend has reached the cap, independent of the manual switches", () => {
    const env = { ...fullyOnEnv, AI_MONTHLY_BUDGET_USD: "5" };
    const getMonthlySpendUsd = vi.fn().mockResolvedValue(5.5);
    return resolveAIFeature("categorization", { getMonthlySpendUsd }, env, silentLogger).then((result) => {
      expect(result.enabled).toBe(false);
      expect(result.reason).toMatch(/budget/i);
    });
  });

  it("is ON when spend is under the cap", async () => {
    const env = { ...fullyOnEnv, AI_MONTHLY_BUDGET_USD: "5" };
    const getMonthlySpendUsd = vi.fn().mockResolvedValue(1.2);
    const result = await resolveAIFeature("categorization", { getMonthlySpendUsd }, env, silentLogger);
    expect(result.enabled).toBe(true);
  });

  it("never calls the spend lookup when a flag already turned the feature off (short-circuits before step 4)", async () => {
    const env = { ...fullyOnEnv, AI_FEATURES_ENABLED: "false" };
    const getMonthlySpendUsd = vi.fn().mockResolvedValue(0);
    await resolveAIFeature("categorization", { getMonthlySpendUsd }, env, silentLogger);
    expect(getMonthlySpendUsd).not.toHaveBeenCalled();
  });

  it("skips the spend check entirely when no cap is configured", async () => {
    const env = { ...fullyOnEnv, AI_MONTHLY_BUDGET_USD: undefined };
    const getMonthlySpendUsd = vi.fn().mockResolvedValue(999999);
    const result = await resolveAIFeature("categorization", { getMonthlySpendUsd }, env, silentLogger);
    expect(result.enabled).toBe(true);
  });
});

describe("disabledEnvelope — §4.5 standardized response body", () => {
  it("always shapes { enabled: false, reason }", () => {
    expect(disabledEnvelope({ enabled: false, reason: "x" })).toEqual({ enabled: false, reason: "x" });
    expect(disabledEnvelope({ enabled: false })).toEqual({ enabled: false, reason: "This feature is currently disabled." });
  });
});
