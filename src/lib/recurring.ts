import { addMonths, addWeeks, formatISO, parseISO } from "date-fns";

export type RecurrenceFrequency = "weekly" | "monthly";

/** Advances a `YYYY-MM-DD` date string by one recurrence period (§6.5). */
export function advanceRecurrence(dateISO: string, frequency: RecurrenceFrequency): string {
  const date = parseISO(dateISO);
  const next = frequency === "weekly" ? addWeeks(date, 1) : addMonths(date, 1);
  return formatISO(next, { representation: "date" });
}
