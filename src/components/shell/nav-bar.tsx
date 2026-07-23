"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, BookOpen, Users, BarChart2, Plus, Search } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { initialsFor } from "@/components/ui/avatar";

const TABS = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/ledger", label: "Ledger", icon: BookOpen },
  { href: "/split", label: "Split Studio", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
];

export function NavBar({
  fullName,
  onNewEntry,
}: {
  fullName: string;
  onNewEntry: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleAvatarClick() {
    router.push("/settings");
  }

  return (
    <div className="flex h-[60px] items-center gap-[30px] border-b border-border bg-bg px-7">
      <Link href="/dashboard" className="flex items-center gap-2 text-base font-extrabold text-text">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-gold font-black text-gold-ink">
          L
        </div>
        LEDGR
      </Link>
      <nav className="flex flex-1 gap-1" aria-label="Primary">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "flex items-center gap-1.5 border-b-2 px-1 py-5 text-[13.5px] font-semibold transition-colors",
                active ? "border-gold text-gold" : "border-transparent text-text-dim hover:text-text"
              )}
              style={{ marginRight: 14 }}
              aria-current={active ? "page" : undefined}
            >
              <tab.icon size={14} /> {tab.label}
            </Link>
          );
        })}
      </nav>
      <button
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-dim"
        title="Search"
      >
        <Search size={13} /> Search <span className="opacity-60">⌘K</span>
      </button>
      <button
        onClick={handleAvatarClick}
        title="Profile settings"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gold-dim text-xs font-bold text-gold"
      >
        {initialsFor(fullName || "You")}
      </button>
      <button
        onClick={onNewEntry}
        title="New entry"
        className="flex items-center gap-1.5 rounded-[9px] bg-gold px-2.5 py-2 font-bold text-gold-ink hover:brightness-110"
      >
        <Plus size={16} />
      </button>
      <SignOutInline />
    </div>
  );
}

function SignOutInline() {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }
  return (
    <button onClick={signOut} className="text-xs font-semibold text-text-faint hover:text-text-dim">
      Sign out
    </button>
  );
}
