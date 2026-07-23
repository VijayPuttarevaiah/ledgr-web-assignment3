import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { resolveAIFeature, disabledEnvelope } from "@/lib/ai/kill-switch";
import { getMonthlySpendUsd, logAIUsage } from "@/lib/ai/usage";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount_cents: z.number().int().positive(),
});

/** [AI] §7.3, §8 — category suggestion. Always returns HTTP 200; `enabled: false` when off (§4.5). */
export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser();

    const resolution = await resolveAIFeature("categorization", { getMonthlySpendUsd });
    if (!resolution.enabled) {
      return NextResponse.json(disabledEnvelope(resolution));
    }

    const rate = await checkRateLimit("ai-categorize", user.id, 20, 60);
    if (!rate.success) throw Errors.rateLimited();

    const { description, amount_cents } = bodySchema.parse(await request.json());

    const { data: categories } = await supabase
      .from("categories")
      .select("id, name")
      .or(`user_id.eq.${user.id},user_id.is.null`);
    if (!categories || categories.length === 0) {
      return NextResponse.json({ enabled: true, category_id: null, category_name: null, confidence: 0 });
    }

    const model = process.env.ANTHROPIC_MODEL_CATEGORIZATION || "claude-haiku-4-5-20251001";
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const categoryNames = categories.map((c) => c.name);
    const message = await anthropic.messages.create({
      model,
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: `Categorize this personal-finance transaction into exactly one of these categories: ${categoryNames.join(", ")}.\nDescription: "${description}"\nAmount: $${(amount_cents / 100).toFixed(2)}\nRespond with strict JSON only: {"category": "<one of the categories above>", "confidence": <integer 0-100>}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    let categoryName: string | null = null;
    let confidence = 0;
    try {
      const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");
      categoryName = typeof parsed.category === "string" ? parsed.category : null;
      confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, Math.round(parsed.confidence))) : 0;
    } catch {
      logger.warn("Failed to parse Claude categorization response as JSON", { route: "categorize" });
    }

    const match = categories.find((c) => c.name.toLowerCase() === categoryName?.toLowerCase());

    // Anthropic Haiku-class pricing is fractions of a cent per call; a small flat
    // estimate keeps the spend-cap check meaningful without a token-accounting pass.
    await logAIUsage(user.id, "categorization", model, 0.001);

    return NextResponse.json({
      enabled: true,
      category_id: match?.id ?? null,
      category_name: match?.name ?? null,
      confidence,
    });
  } catch (error) {
    return jsonError(error, "POST /api/transactions/categorize");
  }
}
