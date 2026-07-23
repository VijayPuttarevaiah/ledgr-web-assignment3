"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card, CardLabel } from "@/components/ui/card";

/**
 * [AI] §7.6/§4.4 — this whole component only renders when
 * NEXT_PUBLIC_AI_NARRATIVE_ENABLED is true; the parent decides whether to
 * mount it at all, so when the flag is off this card is entirely absent
 * from the layout, not shown empty or as a locked placeholder.
 */
export function AiNarrativeCard() {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics/narrative", { method: "POST" });
        const body = await res.json();
        if (cancelled) return;
        if (body.enabled && Array.isArray(body.insights)) {
          setInsights(body.insights);
          setUpdatedAt(new Date(body.generatedAt));
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = (insights ?? []).filter((_, i) => !dismissed.has(i));
  if (error || (insights && visible.length === 0)) return null;

  return (
    <Card data-testid="ai-narrative-card">
      <div className="mb-2 flex items-center justify-between">
        <CardLabel>AI monthly summary {updatedAt && `· updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}</CardLabel>
      </div>
      {!insights ? (
        <div className="text-[13px] text-text-faint">Reading your data…</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {insights.map(
            (text, i) =>
              !dismissed.has(i) && (
                <div key={i} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-b-0 last:pb-0">
                  <p className="text-[13.5px] leading-relaxed text-[#d8d8d4]">{text}</p>
                  <button
                    onClick={() => setDismissed((prev) => new Set(prev).add(i))}
                    title="Dismiss this insight"
                    aria-label="Dismiss this insight"
                    className="shrink-0 text-text-faint hover:text-text-dim"
                  >
                    <X size={15} />
                  </button>
                </div>
              )
          )}
        </div>
      )}
    </Card>
  );
}
