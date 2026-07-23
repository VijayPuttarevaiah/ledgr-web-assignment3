import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

/**
 * §9 — rate limiting on every AI-calling endpoint. Uses Upstash Redis when
 * configured; falls back to an in-process limiter for local dev / grading
 * environments without an Upstash account (documented in DECISIONS.md).
 * The in-memory fallback is per-server-instance, which is fine for a single
 * dev server but not for a multi-instance production deploy — that's
 * exactly why it only activates when Upstash env vars are absent.
 */
const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const limiters = new Map<string, Ratelimit>();

function getUpstashLimiter(bucket: string, limit: number, windowSeconds: number): Ratelimit {
  let rl = limiters.get(bucket);
  if (!rl) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      prefix: `ledgr:${bucket}`,
    });
    limiters.set(bucket, rl);
  }
  return rl;
}

interface MemoryBucket {
  count: number;
  resetAt: number;
}
const memoryBuckets = new Map<string, MemoryBucket>();

function checkMemoryLimit(
  key: string,
  limit: number,
  windowSeconds: number
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowSeconds * 1000;
    memoryBuckets.set(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, reset: resetAt };
  }
  if (existing.count >= limit) {
    return { success: false, remaining: 0, reset: existing.resetAt };
  }
  existing.count += 1;
  return { success: true, remaining: limit - existing.count, reset: existing.resetAt };
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

/**
 * @param bucket logical rate-limit family, e.g. "ai-categorize"
 * @param identifier who is being limited, e.g. the user id
 */
export async function checkRateLimit(
  bucket: string,
  identifier: string,
  limit = 20,
  windowSeconds = 60
): Promise<RateLimitResult> {
  if (hasUpstash) {
    const rl = getUpstashLimiter(bucket, limit, windowSeconds);
    const result = await rl.limit(identifier);
    if (!result.success) {
      logger.warn({ bucket, identifier }, "Rate limit exceeded");
    }
    return { success: result.success, remaining: result.remaining, reset: result.reset };
  }
  const result = checkMemoryLimit(`${bucket}:${identifier}`, limit, windowSeconds);
  if (!result.success) {
    logger.warn({ bucket, identifier }, "Rate limit exceeded (in-memory limiter)");
  }
  return result;
}
