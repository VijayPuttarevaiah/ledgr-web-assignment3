import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const startedAt = Date.now();
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("categories").select("id").limit(1);
    const dbOk = !error;
    return NextResponse.json(
      {
        status: dbOk ? "ok" : "degraded",
        database: dbOk ? "ok" : "unreachable",
        responseTimeMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: dbOk ? 200 : 503 }
    );
  } catch {
    return NextResponse.json(
      { status: "down", database: "unreachable", responseTimeMs: Date.now() - startedAt, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
