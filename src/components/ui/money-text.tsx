import clsx from "clsx";
import { formatCents, formatCentsSigned } from "@/lib/money";

/**
 * The single money-color mapping used everywhere in the app (Ledger, Split
 * Studio, Analytics, Dashboard alike) — fixes the heuristic-evaluation
 * finding that red/green meant "expense/income" on one screen and "you
 * owe/owed to you" on another. Here there is only ever one axis: money
 * flowing out of you (coral) vs. money flowing toward you (teal).
 */
export type MoneyDirection = "in" | "out" | "neutral";

export function directionForTransaction(type: "income" | "expense"): MoneyDirection {
  return type === "income" ? "in" : "out";
}

export function directionForDebt(perspective: "owed_to_you" | "you_owe"): MoneyDirection {
  return perspective === "owed_to_you" ? "in" : "out";
}

const colorClass: Record<MoneyDirection, string> = {
  in: "text-teal",
  out: "text-coral",
  neutral: "text-text",
};

export function MoneyText({
  cents,
  direction,
  signed = false,
  className,
  currency,
}: {
  cents: number;
  direction: MoneyDirection;
  signed?: boolean;
  className?: string;
  currency?: string;
}) {
  const value = signed
    ? formatCentsSigned(direction === "out" ? -Math.abs(cents) : Math.abs(cents), currency)
    : formatCents(cents, currency);
  return <span className={clsx(colorClass[direction], className)}>{value}</span>;
}
