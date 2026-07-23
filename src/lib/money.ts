/**
 * All monetary arithmetic in LEDGR happens in integer cents (§1 non-negotiable #5).
 * Floats are only ever used at the display/input boundary, converted here.
 */

export function dollarsToCents(dollars: number | string): number {
  const n = typeof dollars === "string" ? Number(dollars.replace(/[^0-9.-]/g, "")) : dollars;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  let f = currencyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-CA", { style: "currency", currency });
    currencyFormatters.set(currency, f);
  }
  return f;
}

/** Formats integer cents as a currency string, e.g. 7240 -> "$72.40". */
export function formatCents(cents: number, currency = "CAD"): string {
  return getFormatter(currency).format(centsToDollars(cents));
}

/** Formats with an explicit leading sign, e.g. +$72.40 / -$45.00 — used wherever direction matters. */
export function formatCentsSigned(cents: number, currency = "CAD"): string {
  const abs = getFormatter(currency).format(centsToDollars(Math.abs(cents)));
  if (cents === 0) return abs;
  return cents > 0 ? `+${abs}` : `-${abs}`;
}

/**
 * Integer-safe division of a total into `n` equal integer shares, cents-exact.
 * Any remainder cents (from a division that doesn't come out even) are
 * returned separately so the caller can allocate them per the relevant
 * business rule (§6.1: leftover goes to whoever paid).
 */
export function splitEvenly(totalCents: number, n: number): { base: number; remainder: number } {
  if (n <= 0) throw new Error("splitEvenly: n must be positive");
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return { base, remainder };
}

/** Rounds a fractional cents value to the nearest integer cent (half-up). */
export function roundCents(value: number): number {
  return Math.round(value);
}
