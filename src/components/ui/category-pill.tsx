/**
 * Category color always comes from the `categories` row itself (one
 * definition per category, stored once in the database) rather than a
 * hardcoded per-screen lookup table — that's what guarantees the same
 * category renders identically on the Ledger, Dashboard, and Analytics.
 */
export function CategoryPill({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="rounded-full px-2.5 py-[3px] text-[11.5px] font-bold"
      style={{ color, backgroundColor: `${color}1c` }}
    >
      {name}
    </span>
  );
}

export function UncategorizedPill() {
  return (
    <span className="rounded-full border border-border px-2.5 py-[3px] text-[11.5px] font-semibold text-text-faint">
      Uncategorized
    </span>
  );
}
