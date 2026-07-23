"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, BookOpen, Users, BarChart2, Plus, Search, LogOut } from "lucide-react";
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
    <div className="flex h-[60px] items-center gap-2 border-b border-border bg-bg px-3 sm:gap-[18px] sm:px-5 lg:gap-[30px] lg:px-7">
      <Link href="/dashboard" className="flex shrink-0 items-center gap-2 text-base font-extrabold text-text">
        <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-gold font-black text-gold-ink">
          L
        </div>
        <span className="hidden sm:inline">LEDGR</span>
      </Link>
      <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto sm:gap-1" aria-label="Primary">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "flex items-center gap-1.5 border-b-2 px-1.5 py-5 text-[13.5px] font-semibold whitespace-nowrap transition-colors sm:px-2",
                active ? "border-gold text-gold" : "border-transparent text-text-dim hover:text-text"
              )}
              aria-current={active ? "page" : undefined}
            >
              <tab.icon size={14} className="shrink-0" /> {tab.label}
            </Link>
          );
        })}
      </nav>
      <button
        className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-dim lg:flex"
        title="Search"
      >
        <Search size={13} /> Search <span className="opacity-60">⌘K</span>
      </button>
      <button
        onClick={handleAvatarClick}
        title="Profile settings"
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gold-dim text-xs font-bold text-gold"
      >
        {initialsFor(fullName || "You")}
      </button>
      <button
        onClick={onNewEntry}
        title="New entry"
        className="flex shrink-0 items-center gap-1.5 rounded-[9px] bg-gold px-2.5 py-2 font-bold text-gold-ink hover:brightness-110"
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
    <button
      onClick={signOut}
      title="Sign out"
      className="flex shrink-0 items-center gap-1 text-xs font-semibold text-text-faint hover:text-text-dim"
    >
      <LogOut size={14} className="sm:hidden" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}
