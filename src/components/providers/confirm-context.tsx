"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

interface ConfirmContextValue {
  /** Resolves true if the user confirms, false if they cancel. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue["confirm"] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx.confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onKeyDown={(e) => {
            if (e.key === "Escape") settle(false);
          }}
        >
          <div className="w-full max-w-sm rounded-[14px] border border-border bg-surface p-6">
            <div className="mb-4 flex items-start gap-2.5">
              <AlertTriangle
                size={20}
                className={pending.tone === "danger" ? "mt-0.5 shrink-0 text-coral" : "mt-0.5 shrink-0 text-gold"}
              />
              <div>
                <div id="confirm-dialog-title" className="mb-1.5 text-[15px] font-semibold text-text">
                  {pending.title}
                </div>
                <div className="text-[13.5px] leading-relaxed text-text-dim">{pending.body}</div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2.5">
              <button
                autoFocus
                onClick={() => settle(false)}
                className="rounded-[9px] border border-border bg-surface-2 px-4 py-2.5 text-[13.5px] font-semibold text-text hover:bg-border/60"
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={() => settle(true)}
                className={
                  pending.tone === "danger"
                    ? "rounded-[9px] bg-coral px-4 py-2.5 text-[13.5px] font-bold text-[#2a0e0d] hover:brightness-110"
                    : "rounded-[9px] bg-gold px-4 py-2.5 text-[13.5px] font-bold text-gold-ink hover:brightness-110"
                }
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
