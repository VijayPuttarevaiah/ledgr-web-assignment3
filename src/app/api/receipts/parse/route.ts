import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { resolveAIFeature, disabledEnvelope } from "@/lib/ai/kill-switch";
import { getMonthlySpendUsd, logAIUsage } from "@/lib/ai/usage";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildReceiptPath, RECEIPTS_BUCKET } from "@/lib/supabase/storage-shared";
import { withOneRetry } from "@/lib/ai/retry-once";
import { logger } from "@/lib/logger";

const MAX_BYTES = 8 * 1024 * 1024;

interface ParsedReceipt {
  merchant: string;
  total_amount_cents: number;
  occurred_on: string;
  suggested_category: string | null;
  line_items: { item_name: string; quantity: number; unit_price_cents: number }[];
}

/**
 * [AI] §7.3/§7.5 receipt OCR. Uses Claude's native vision input rather than
 * a separate Google Cloud Vision call — see DECISIONS.md #OCR-vendor.
 * Always HTTP 200; `enabled: false` when off, `success: false` on a genuine
 * parse failure so the client shows the "couldn't read that clearly"
 * fallback instead of treating either case as a routing/auth error (§4.5).
 */
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser();

    const resolution = await resolveAIFeature("ocr", { getMonthlySpendUsd });
    if (!resolution.enabled) {
      return NextResponse.json(disabledEnvelope(resolution));
    }

    const rate = await checkRateLimit("ai-ocr", user.id, 10, 60);
    if (!rate.success) throw Errors.rateLimited();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw Errors.badRequest("Attach a receipt image first.");
    if (file.size > MAX_BYTES) throw Errors.badRequest("That image is too large — try one under 8MB.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = buildReceiptPath(user.id, file.name);
    const { error: uploadError } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, bytes, {
      contentType: file.type || "image/jpeg",
    });
    if (uploadError) throw Errors.internal("Couldn't store that receipt image. Try again.");

    const { data: categories } = await supabase
      .from("categories")
      .select("id, name")
      .or(`user_id.eq.${user.id},user_id.is.null`);

    const base64 = Buffer.from(bytes).toString("base64");
    const model = process.env.ANTHROPIC_MODEL_CATEGORIZATION || "claude-haiku-4-5-20251001";
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const categoryNames = (categories ?? []).map((c) => c.name);
    let parsed: ParsedReceipt | { error: string };
    try {
      // §11: retry once automatically before surfacing the manual-entry fallback.
      const message = await withOneRetry("ocr", () =>
        anthropic.messages.create({
          model,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: (file.type || "image/jpeg") as "image/jpeg", data: base64 } },
                {
                  type: "text",
                  text: `Read this receipt. Respond with strict JSON only, no prose: {"merchant": string, "total_amount_cents": integer, "occurred_on": "YYYY-MM-DD", "suggested_category": one of [${categoryNames.join(", ")}] or null, "line_items": [{"item_name": string, "quantity": number, "unit_price_cents": integer}]}. If you cannot read the receipt clearly, respond with {"error": "unreadable"}.`,
                },
              ],
            },
          ],
        })
      );
      const textBlock = message.content.find((b) => b.type === "text");
      const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";
      parsed = JSON.parse(raw);
      await logAIUsage(user.id, "ocr", model, 0.003);
    } catch (aiError) {
      logger.warn(
        { route: "receipts/parse", err: aiError instanceof Error ? aiError.message : String(aiError) },
        "Receipt OCR failed after one retry — degrading to manual entry"
      );
      return NextResponse.json({ enabled: true, success: false, receipt_image_path: path });
    }

    if ("error" in parsed || !parsed.total_amount_cents) {
      return NextResponse.json({ enabled: true, success: false, receipt_image_path: path });
    }

    const match = categories?.find((c) => c.name.toLowerCase() === parsed.suggested_category?.toLowerCase());

    return NextResponse.json({
      enabled: true,
      success: true,
      receipt_image_path: path,
      amount_cents: parsed.total_amount_cents,
      description: parsed.merchant,
      occurred_on: parsed.occurred_on,
      category_id: match?.id ?? null,
      category_name: match?.name ?? null,
      confidence: match ? 90 : 0,
      line_items: parsed.line_items ?? [],
    });
  } catch (error) {
    return jsonError(error, "POST /api/receipts/parse");
  }
}
