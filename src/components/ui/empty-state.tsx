import type { LucideIcon } from "lucide-react";

/** Every list/table gets one of these instead of a blank void (§7.8). */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-border px-8 py-16 text-center">
      <Icon size={26} className="text-text-faint" />
      <div className="text-[15px] font-bold text-text">{title}</div>
      <div className="max-w-sm text-[13.5px] text-text-dim">{body}</div>
      {action}
    </div>
  );
}
