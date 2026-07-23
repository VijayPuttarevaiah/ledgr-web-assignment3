import { describe, it, expect } from "vitest";
import { advanceRecurrence } from "@/lib/recurring";

describe("advanceRecurrence (§6.5)", () => {
  it("advances weekly by 7 days", () => {
    expect(advanceRecurrence("2026-06-01", "weekly")).toBe("2026-06-08");
  });

  it("advances monthly, handling month-end correctly", () => {
    expect(advanceRecurrence("2026-01-31", "monthly")).toBe("2026-02-28"); // date-fns clamps to the shorter month
    expect(advanceRecurrence("2026-06-15", "monthly")).toBe("2026-07-15");
  });

  it("advances across a year boundary", () => {
    expect(advanceRecurrence("2026-12-20", "monthly")).toBe("2027-01-20");
  });
});
