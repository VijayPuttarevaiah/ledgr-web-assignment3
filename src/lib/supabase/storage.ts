import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export { RECEIPTS_BUCKET, buildReceiptPath } from "./storage-shared";
import { RECEIPTS_BUCKET } from "./storage-shared";

/** Receipts live in a private bucket; every read goes through a short-lived signed URL (§9). */
export async function getReceiptSignedUrl(
  supabase: SupabaseClient<Database>,
  path: string,
  expiresInSeconds = 300
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}
