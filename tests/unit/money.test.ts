import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { dollarsToCents, centsToDollars, formatCents, formatCentsSigned, splitEvenly } from "@/lib/money";

describe("dollarsToCents / centsToDollars", () => {
  it("round-trips common values", () => {
    expect(dollarsToCents(72.4)).toBe(7240);
    expect(dollarsToCents("87.40")).toBe(8740);
    expect(centsToDollars(7240)).toBe(72.4);
  });

  it("rounds to the nearest cent instead of truncating", () => {
    expect(dollarsToCents(19.999)).toBe(2000); // 1999.9 cents rounds up, not truncates to 1999
  });

  it("never produces NaN for garbage input", () => {
    expect(dollarsToCents("not a number")).toBe(0);
  });
});

describe("formatCents / formatCentsSigned", () => {
  it("formats CAD currency", () => {
    expect(formatCents(7240)).toBe("$72.40");
  });

  it("adds an explicit sign", () => {
    expect(formatCentsSigned(7240)).toBe("+$72.40");
    expect(formatCentsSigned(-4500)).toBe("-$45.00");
    expect(formatCentsSigned(0)).toBe("$0.00");
  });
});

describe("splitEvenly", () => {
  it("splits a total that divides evenly", () => {
    expect(splitEvenly(300, 3)).toEqual({ base: 100, remainder: 0 });
  });

  it("captures the remainder from an uneven division", () => {
    expect(splitEvenly(100, 3)).toEqual({ base: 33, remainder: 1 });
  });

  it("property: base*n + remainder always equals the total", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 1, max: 50 }), (total, n) => {
        const { base, remainder } = splitEvenly(total, n);
        expect(base * n + remainder).toBe(total);
        expect(remainder).toBeGreaterThanOrEqual(0);
        expect(remainder).toBeLessThan(n);
      })
    );
  });
});
