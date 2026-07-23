"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Check, AlertTriangle, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastOptions {
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

let idCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = ++idCounter;
      const item: ToastItem = {
        id,
        message,
        tone: options.tone ?? "success",
        actionLabel: options.actionLabel,
        onAction: options.onAction,
      };
      setItems((prev) => [...prev, item]);
      const timer = setTimeout(() => dismiss(id), options.durationMs ?? 4000);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className="flex items-center gap-3 rounded-[10px] border border-border bg-surface-2 px-4 py-3 text-sm text-text shadow-2xl"
          >
            {item.tone === "error" ? (
              <AlertTriangle size={16} className="shrink-0 text-coral" />
            ) : (
              <Check size={16} className="shrink-0 text-teal" />
            )}
            <span>{item.message}</span>
            {item.actionLabel && (
              <button
                onClick={() => {
                  item.onAction?.();
                  dismiss(item.id);
                }}
                className="font-bold text-gold hover:underline"
              >
                {item.actionLabel}
              </button>
            )}
            <button
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="text-text-faint hover:text-text-dim"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
