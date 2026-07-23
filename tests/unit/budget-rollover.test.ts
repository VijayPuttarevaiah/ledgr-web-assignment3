import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeRolloverCents, effectiveBudgetCents } from "@/lib/budget-rollover";

describe("computeRolloverCents (§6.3)", () => {
  it("rolls forward the full surplus when it's under the 50% cap", () => {
    // base 10000, spent 8000 -> surplus 2000, cap is 5000, so full surplus rolls.
    expect(computeRolloverCents(10_000, 8_000)).toBe(2_000);
  });

  it("caps the rollover at 50% of the base amount", () => {
    // base 10000, spent 1000 -> surplus 9000, capped at 5000.
    expect(computeRolloverCents(10_000, 1_000)).toBe(5_000);
  });

  it("rolls forward nothing when spend exactly equals the base", () => {
    expect(computeRolloverCents(10_000, 10_000)).toBe(0);
  });

  it("carries forward no deficit on overspend — next month starts at full base", () => {
    expect(computeRolloverCents(10_000, 15_000)).toBe(0);
  });

  it("property: rollover is always between 0 and 50% of base", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 0, max: 10_000_000 }), (base, spend) => {
        const rollover = computeRolloverCents(base, spend);
        expect(rollover).toBeGreaterThanOrEqual(0);
        expect(rollover).toBeLessThanOrEqual(Math.floor(base * 0.5));
      })
    );
  });
});

describe("effectiveBudgetCents", () => {
  it("is base plus rollover", () => {
    expect(effectiveBudgetCents(10_000, 2_000)).toBe(12_000);
  });
});
