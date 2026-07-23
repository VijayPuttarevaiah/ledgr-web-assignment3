import "server-only";
import { logger } from "@/lib/logger";

/**
 * §11 — "a failed AI call retries once automatically before surfacing a
 * manual-entry fallback." One retry, no backoff loop (AI calls are
 * user-facing and synchronous — a long retry chain would just make the
 * user wait instead of falling back to manual entry, which defeats the
 * point). Callers still need their own catch/fallback for when both
 * attempts fail — this only covers the "automatic retry" half.
 */
export async function withOneRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (firstError) {
    logger.warn(
      { label, err: firstError instanceof Error ? firstError.message : String(firstError) },
      `${label} failed once, retrying`
    );
    return await fn();
  }
}
