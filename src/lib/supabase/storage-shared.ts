// No "server-only" guard here on purpose: the client needs the bucket name
// and path convention to upload directly (RLS-protected) in the non-AI
// receipt-attachment path. Signed-URL generation stays server-only — see
// storage.ts.
export const RECEIPTS_BUCKET = "receipts";

export function buildReceiptPath(userId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${userId}/${Date.now()}-${safeName}`;
}
