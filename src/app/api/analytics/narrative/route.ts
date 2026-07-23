import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { resolveAIFeature, disabledEnvelope } from "@/lib/ai/kill-switch";
import { getMonthlySpendUsd, logAIUsage } from "@/lib/ai/usage";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAnalyticsSummary } from "@/lib/analytics";
import { formatCents } from "@/lib/money";

/** [AI] §7.6 — plain-language monthly summary, naming real numbers from the user's own data, never generic filler. */
export async function POST() {
  try {
    const { user, supabase } = await requireUser();

    const resolution = await resolveAIFeature("narrative", { getMonthlySpendUsd });
    if (!resolution.enabled) {
      return NextResponse.json(disabledEnvelope(resolution));
    }

    const rate = await checkRateLimit("ai-narrative", user.id, 10, 60);
    if (!rate.success) throw Errors.rateLimited();

    const summary = await getAnalyticsSummary(supabase, user.id, "1M");
    const overBudget = summary.budgetHealth.filter((b) => b.pct > 100).sort((a, b) => b.overCents - a.overCents);
    const underBudget = summary.budgetHealth.filter((b) => b.pct <= 100);

    const facts = [
      `Spending this period: ${formatCents(summary.kpis.spendingCents)}.`,
      `Income this period: ${formatCents(summary.kpis.incomeCents)}.`,
      `Savings rate: ${summary.kpis.savingsRatePct}%.`,
      `Shared expenses: ${formatCents(summary.kpis.sharedCents)} (${summary.kpis.sharedPct}% of spending).`,
      overBudget.length > 0
        ? `Over-budget categories: ${overBudget.map((b) => `${b.name} is ${formatCents(b.overCents)} over (${b.pct}% of budget)`).join("; ")}.`
        : "No categories are over budget.",
      underBudget.length > 0 ? `Under-budget categories: ${underBudget.map((b) => b.name).join(", ")}.` : "",
      `Top spending categories: ${summary.categoryBreakdown
        .slice(0, 3)
        .map((c) => `${c.name} ${c.pct}%`)
        .join(", ")}.`,
    ]
      .filter(Boolean)
      .join(" ");

    const model = process.env.ANTHROPIC_MODEL_NARRATIVE || "claude-sonnet-5";
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are writing 2-3 short, independent, plain-language insights for a personal finance app called LEDGR's monthly summary. Use ONLY these real numbers from the user's data — never invent figures, never use vague filler like "consider reviewing your spending." If a category is over budget, name it specifically and give one concrete, practical suggestion tied to that category, in its own insight. Be direct and specific, second person ("you"). Respond with strict JSON only: {"insights": ["...", "..."]}\n\nData: ${facts}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    let insights: string[] = [];
    try {
      const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");
      if (Array.isArray(parsed.insights)) insights = parsed.insights.filter((s: unknown) => typeof s === "string");
    } catch {
      // leave insights empty; the card will just show nothing rather than break
    }

    await logAIUsage(user.id, "narrative", model, 0.01);

    return NextResponse.json({
      enabled: true,
      insights,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error, "POST /api/analytics/narrative");
  }
}
