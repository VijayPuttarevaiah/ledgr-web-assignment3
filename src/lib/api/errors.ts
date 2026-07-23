import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";

/**
 * Every API error follows one shape: { error: { message, code, field? } }.
 * `message` is always specific and actionable (§11) — never a raw status
 * code or a bare "Something went wrong."
 */
export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export const Errors = {
  unauthenticated: () =>
    new ApiError(401, "unauthenticated", "Your session has expired. Sign in again to continue."),
  forbidden: (message = "You don't have access to this.") => new ApiError(403, "forbidden", message),
  notFound: (thing = "That item") => new ApiError(404, "not_found", `${thing} couldn't be found.`),
  conflict: (message: string) => new ApiError(409, "conflict", message),
  possibleDuplicate: (message: string) => new ApiError(409, "possible_duplicate", message),
  badRequest: (message: string, field?: string) => new ApiError(400, "bad_request", message, field),
  rateLimited: (message = "You're doing that too fast — wait a moment and try again.") =>
    new ApiError(429, "rate_limited", message),
  internal: (message = "Something on our end broke. Try again in a moment.") =>
    new ApiError(500, "internal_error", message),
};

export function jsonError(error: unknown, route: string) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      logger.error({ route, code: error.code }, error.message);
    }
    return NextResponse.json(
      { error: { message: error.message, code: error.code, field: error.field } },
      { status: error.status }
    );
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return NextResponse.json(
      {
        error: {
          message: first?.message ?? "Some fields need fixing before this can be saved.",
          code: "validation_error",
          field: first?.path?.join("."),
        },
      },
      { status: 400 }
    );
  }
  logger.error({ route, err: error instanceof Error ? error.message : String(error) }, "Unhandled route error");
  return NextResponse.json(
    { error: { message: "Something on our end broke. Try again in a moment.", code: "internal_error" } },
    { status: 500 }
  );
}
