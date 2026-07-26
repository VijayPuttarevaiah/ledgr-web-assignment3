import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/errors";
import type { AnalyticsRange } from "@/lib/analytics";
import { getCachedAnalyticsSummary } from "@/lib/api/analytics-cache";

const VALID_RANGES: AnalyticsRange[] = ["1D", "1W", "1M", "3M", "1Y", "All"];

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const url = new URL(request.url);
    const rangeParam = url.searchParams.get("range") ?? "1M";
    const range = (VALID_RANGES.includes(rangeParam as AnalyticsRange) ? rangeParam : "1M") as AnalyticsRange;

    const summary = await getCachedAnalyticsSummary(supabase, user.id, range);
    return NextResponse.json({ range, ...summary });
  } catch (error) {
    return jsonError(error, "GET /api/analytics/summary");
  }
}
