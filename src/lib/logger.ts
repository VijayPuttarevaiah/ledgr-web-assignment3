import pino from "pino";

/**
 * Structured server-side logging (§11). Every server error/warning should
 * carry enough context (route, user id, timestamp, kill-switch state for AI
 * routes) to debug an incident without needing to reproduce it manually.
 * In production this can be shipped to any log sink; locally it prints
 * pretty-printed JSON to stdout.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "ledgr" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;

export function routeLogger(route: string, extra: Record<string, unknown> = {}) {
  return logger.child({ route, ...extra });
}
