import clsx from "clsx";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-[14px] border border-border bg-surface p-[18px]", className)}>{children}</div>
  );
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[10.5px] font-bold tracking-wide text-text-faint uppercase">{children}</div>
  );
}
