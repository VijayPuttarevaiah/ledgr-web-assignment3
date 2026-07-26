"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { NavBar } from "./nav-bar";
import type { Category } from "@/types/domain";

// Assignment 3 §2 — client-side optimisation 1.
//
// AppShell wraps every authenticated route, so anything it imports
// statically ends up in the shared bundle that Dashboard, Ledger, Analytics,
// Split and Settings all download before they can render. NewEntryPanel is
// a modal: the JSX below only mounts it once `newEntryOpen` is true, yet a
// static import made every one of those routes pay for its code — the
// category picker, the receipt-upload flow, the AI categorisation client and
// the form validation — on first paint, to render nothing.
//
// `ssr: false` is correct here rather than incidental: the panel is only
// ever reachable through a click, so there is no server-rendered markup to
// hydrate and no content-shift risk from loading it late.
const NewEntryPanel = dynamic(
  () => import("@/components/new-entry/new-entry-panel").then((m) => m.NewEntryPanel),
  { ssr: false }
);

export function AppShell({
  fullName,
  categories,
  defaultPaymentMethod,
  children,
}: {
  fullName: string;
  categories: Category[];
  defaultPaymentMethod: string;
  children: React.ReactNode;
}) {
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg text-text">
      <NavBar fullName={fullName} onNewEntry={() => setNewEntryOpen(true)} />
      {children}
      {newEntryOpen && (
        <NewEntryPanel
          categories={categories}
          defaultPaymentMethod={defaultPaymentMethod}
          onClose={() => setNewEntryOpen(false)}
          onSaved={() => {
            setNewEntryOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
