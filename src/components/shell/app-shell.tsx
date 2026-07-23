"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NavBar } from "./nav-bar";
import { NewEntryPanel } from "@/components/new-entry/new-entry-panel";
import type { Category } from "@/types/domain";

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
