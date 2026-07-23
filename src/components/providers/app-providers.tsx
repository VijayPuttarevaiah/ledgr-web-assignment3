"use client";

import { ToastProvider } from "./toast-context";
import { ConfirmProvider } from "./confirm-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
