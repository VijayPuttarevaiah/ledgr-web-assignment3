export function Bar2({ pct, color, thin }: { pct: number; color: string; thin?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-full bg-surface-2 ${thin ? "h-[5px]" : "h-[7px]"}`}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }} />
    </div>
  );
}
