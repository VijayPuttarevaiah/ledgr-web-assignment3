import "server-only";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role client. Bypasses RLS entirely — §9 mandates this never
 * reaches client-bundled code, and `server-only` above enforces that at
 * build time (importing this from a Client Component fails the build).
 *
 * Only ever use this for operations §5/§9 explicitly call out as needing
 * it: the recurring-transaction cron job writing on behalf of many users,
 * and server-side ai_usage_log inserts. Everything else should go through
 * the request-scoped client in `server.ts` so RLS stays the ground truth.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("createAdminClient: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createSupabaseJsClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
