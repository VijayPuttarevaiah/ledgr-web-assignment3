const PALETTE = ["#f0a83c", "#2fd1a8", "#ef6461", "#8a7cf0", "#5aa7e8", "#e88ac9", "#7ec98a", "#e0b84c"];

/** Deterministic color per user id, so the same person always renders the same avatar color everywhere. */
export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/**
 * Two-letter initials, not one — fixes the heuristic-evaluation finding
 * that single-letter initials collided (Vijay and Vatsal both "V").
 */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  userId,
  size = 26,
  title,
}: {
  name: string;
  userId: string;
  size?: number;
  title?: string;
}) {
  const color = colorForUserId(userId);
  return (
    <div
      title={title ?? name}
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        background: `${color}26`,
        border: `1.5px solid ${color}`,
        color,
        fontSize: size * 0.36,
      }}
    >
      {initialsFor(name)}
    </div>
  );
}
