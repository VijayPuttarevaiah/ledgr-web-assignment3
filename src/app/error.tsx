"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * §11 — the app must never hard-crash to a white screen; every route gets a
 * recovery action instead of a stack trace.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console -- client-side fallback logging; server errors go through pino (src/lib/logger.ts)
    console.error("LEDGR route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle size={28} className="text-coral" />
      <div className="text-lg font-bold text-text">That didn&apos;t load right.</div>
      <div className="max-w-md text-sm text-text-dim">
        Something broke while rendering this page. Your data is safe — this is a display problem, not a data
        problem. Try again, and if it keeps happening, refresh the whole page.
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
