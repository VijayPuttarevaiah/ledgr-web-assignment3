import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  splitEqual,
  validateExactSplit,
  splitWeighted,
  splitItemised,
  allocateTaxTipDiscount,
  sumShares,
  type LineItemInput,
  type WeightedParticipant,
} from "@/lib/split-math";

describe("splitEqual (§6.1)", () => {
  it("splits evenly with no remainder", () => {
    const shares = splitEqual(300, ["a", "b", "c"], "a");
    expect(shares).toEqual({ a: 100, b: 100, c: 100 });
  });

  it("gives any uneven remainder to whoever paid", () => {
    const shares = splitEqual(100, ["a", "b", "c"], "b");
    expect(shares.a).toBe(33);
    expect(shares.c).toBe(33);
    expect(shares.b).toBe(34); // 33 base + 1 cent remainder
    expect(sumShares(shares)).toBe(100);
  });
});

describe("validateExactSplit (§6.1)", () => {
  it("accepts amounts that reconcile exactly", () => {
    expect(validateExactSplit(1000, { a: 400, b: 600 })).toEqual({ valid: true, sum: 1000, deltaCents: 0 });
  });

  it("rejects amounts that don't reconcile, with the exact delta", () => {
    expect(validateExactSplit(1000, { a: 400, b: 550 })).toEqual({ valid: false, sum: 950, deltaCents: 50 });
  });
});

describe("splitWeighted (§6.1)", () => {
  it("splits proportional to weight", () => {
    const shares = splitWeighted(1000, [{ userId: "a", weight: 1 }, { userId: "b", weight: 3 }], "a");
    expect(shares.a).toBe(250);
    expect(shares.b).toBe(750);
  });

  it("gives a rounding remainder to the largest-weight participant", () => {
    // 100 split 1:1:1 -> 33.33 each; largest weight is tied 3-ways, tie-break to payer
    const shares = splitWeighted(
      100,
      [{ userId: "a", weight: 1 }, { userId: "b", weight: 1 }, { userId: "c", weight: 1 }],
      "c"
    );
    expect(sumShares(shares)).toBe(100);
    expect(shares.c).toBeGreaterThanOrEqual(shares.a);
  });

  it("throws for zero total weight", () => {
    expect(() => splitWeighted(100, [{ userId: "a", weight: 0 }], "a")).toThrow();
  });
});

describe("splitItemised (§6.1)", () => {
  it("splits a line item evenly among everyone assigned to it", () => {
    const items: LineItemInput[] = [{ id: "1", lineTotalCents: 2000, assignedUserIds: ["a", "b"] }];
    expect(splitItemised(items)).toEqual({ a: 1000, b: 1000 });
  });

  it("gives an uneven-division remainder to the first person assigned to that item", () => {
    const items: LineItemInput[] = [{ id: "1", lineTotalCents: 101, assignedUserIds: ["b", "a"] }];
    const shares = splitItemised(items);
    expect(shares.b).toBe(51); // first-assigned gets the remainder
    expect(shares.a).toBe(50);
  });

  it("accumulates across multiple items", () => {
    const items: LineItemInput[] = [
      { id: "1", lineTotalCents: 1000, assignedUserIds: ["a"] },
      { id: "2", lineTotalCents: 500, assignedUserIds: ["a", "b"] },
    ];
    expect(splitItemised(items)).toEqual({ a: 1250, b: 250 });
  });

  it("skips items nobody is assigned to (data-entry gap, not a math error)", () => {
    const items: LineItemInput[] = [{ id: "1", lineTotalCents: 500, assignedUserIds: [] }];
    expect(splitItemised(items)).toEqual({});
  });
});

describe("allocateTaxTipDiscount (§6.2)", () => {
  it("computes a clean, self-consistent worked example exactly", () => {
    // Two items: $10.00 shared by a+b, $5.00 solo to c. Subtotal $15.00.
    const items: LineItemInput[] = [
      { id: "1", lineTotalCents: 1000, assignedUserIds: ["a", "b"] },
      { id: "2", lineTotalCents: 500, assignedUserIds: ["c"] },
    ];
    const itemSubtotalsByUser = splitItemised(items); // a:500 b:500 c:500
    const billSubtotalCents = 1500;
    const taxAmountCents = 150; // 10%
    const tipAmountCents = 225; // 15%
    const discountAmountCents = 100;
    const totalAmountCents = billSubtotalCents + taxAmountCents + tipAmountCents - discountAmountCents; // 1775

    const shares = allocateTaxTipDiscount({
      itemSubtotalsByUser,
      billSubtotalCents,
      discountAmountCents,
      taxAmountCents,
      taxAllocation: "proportional",
      tipAmountCents,
      tipAllocation: "proportional",
      totalAmountCents,
      paidBy: "a",
    });

    // Each of a/b/c has an equal 1/3 share of subtotal, so proportional
    // allocation splits everything three ways evenly too.
    expect(shares.a + shares.b + shares.c).toBe(totalAmountCents);
    // 1775 / 3 = 591.67 -> two get 592, one gets 591 depending on rounding + remainder assignment.
    for (const v of Object.values(shares)) {
      expect(v).toBeGreaterThanOrEqual(591);
      expect(v).toBeLessThanOrEqual(592);
    }
  });

  it("supports independent proportional/equal choices for tax vs tip", () => {
    const itemSubtotalsByUser = { a: 8000, b: 2000 }; // a ordered much more than b
    const shares = allocateTaxTipDiscount({
      itemSubtotalsByUser,
      billSubtotalCents: 10000,
      discountAmountCents: 0,
      taxAmountCents: 1000,
      taxAllocation: "proportional", // a pays 80% of tax
      tipAmountCents: 1000,
      tipAllocation: "equal", // a and b split tip 50/50
      totalAmountCents: 12000,
      paidBy: "a",
    });
    expect(shares.a).toBe(8000 + 800 + 500);
    expect(shares.b).toBe(2000 + 200 + 500);
  });

  it("falls back to equal allocation when the bill subtotal is zero (degenerate case)", () => {
    const shares = allocateTaxTipDiscount({
      itemSubtotalsByUser: { a: 0, b: 0 },
      billSubtotalCents: 0,
      discountAmountCents: 0,
      taxAmountCents: 0,
      taxAllocation: "proportional",
      tipAmountCents: 1000,
      tipAllocation: "proportional",
      totalAmountCents: 1000,
      paidBy: "a",
    });
    expect(shares.a).toBe(500);
    expect(shares.b).toBe(500);
  });
});

describe("§6.2 invariant: shares always sum exactly to the total (property-based)", () => {
  it("equal split", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 12 }).map((arr) => [...new Set(arr)]),
        (total, ids) => {
          fc.pre(ids.length > 0);
          const payer = ids[0];
          const shares = splitEqual(total, ids, payer);
          expect(sumShares(shares)).toBe(total);
        }
      )
    );
  });

  it("weighted split", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc
          .array(fc.record({ userId: fc.uuid(), weight: fc.double({ min: 0.01, max: 1000, noNaN: true }) }), {
            minLength: 1,
            maxLength: 10,
          })
          .map((arr) => {
            const seen = new Set<string>();
            return arr.filter((p) => (seen.has(p.userId) ? false : (seen.add(p.userId), true)));
          }),
        (total, participants) => {
          fc.pre(participants.length > 0);
          const shares = splitWeighted(total, participants as WeightedParticipant[], participants[0].userId);
          expect(sumShares(shares)).toBe(total);
        }
      )
    );
  });

  it("itemised + tax/tip/discount, across random allocation modes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("a", "b", "c", "d"), { minLength: 1, maxLength: 4 }).map((arr) => [...new Set(arr)]),
        fc.array(fc.integer({ min: 1, max: 500_000 }), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 50_000 }),
        fc.constantFrom("proportional", "equal"),
        fc.constantFrom("proportional", "equal"),
        (participantPool, itemPrices, taxCents, tipCents, discountRaw, taxAllocation, tipAllocation) => {
          fc.pre(participantPool.length > 0);
          const items: LineItemInput[] = itemPrices.map((price, i) => ({
            id: String(i),
            lineTotalCents: price,
            // deterministically assign each item to a non-empty subset of participants
            assignedUserIds: participantPool.filter((_, idx) => (i + idx) % 2 === 0).length
              ? participantPool.filter((_, idx) => (i + idx) % 2 === 0)
              : [participantPool[0]],
          }));
          const billSubtotalCents = items.reduce((a, it) => a + it.lineTotalCents, 0);
          const discountAmountCents = Math.min(discountRaw, billSubtotalCents);
          const itemSubtotalsByUser = splitItemised(items);
          for (const uid of participantPool) if (!(uid in itemSubtotalsByUser)) itemSubtotalsByUser[uid] = 0;
          const totalAmountCents = billSubtotalCents + taxCents + tipCents - discountAmountCents;
          fc.pre(totalAmountCents > 0);

          const shares = allocateTaxTipDiscount({
            itemSubtotalsByUser,
            billSubtotalCents,
            discountAmountCents,
            taxAmountCents: taxCents,
            taxAllocation,
            tipAmountCents: tipCents,
            tipAllocation,
            totalAmountCents,
            paidBy: participantPool[0],
          });

          expect(sumShares(shares)).toBe(totalAmountCents);
        }
      ),
      { numRuns: 200 }
    );
  });
});
