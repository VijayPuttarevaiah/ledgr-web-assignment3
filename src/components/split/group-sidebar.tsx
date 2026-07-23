"use client";

import { Plus } from "lucide-react";
import type { GroupSummary } from "./split-studio-client";

export function GroupSidebar({
  groups,
  selectedGroupId,
  onSelect,
  onNewGroup,
}: {
  groups: GroupSummary[];
  selectedGroupId: string | null;
  onSelect: (id: string) => void;
  onNewGroup: () => void;
}) {
  return (
    <div className="w-[220px] shrink-0">
      <div className="mb-2.5 text-[11px] font-bold tracking-wide text-text-faint uppercase">Groups</div>
      <button
        onClick={onNewGroup}
        className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-border bg-surface-2 py-2.5 text-[13.5px] font-semibold text-text hover:bg-border/60"
      >
        <Plus size={13} /> New group
      </button>
      {groups.map((g) => {
        const active = g.id === selectedGroupId;
        return (
          <button
            key={g.id}
            onClick={() => onSelect(g.id)}
            className={
              "mb-0.5 w-full rounded px-3 py-2.5 text-left " +
              (active ? "border-l-2 border-gold bg-surface" : "border-l-2 border-transparent")
            }
          >
            <div className={`text-[13.5px] font-bold ${active ? "text-gold" : "text-text"}`}>{g.name}</div>
            <div className="text-[11.5px] text-text-faint">
              {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
