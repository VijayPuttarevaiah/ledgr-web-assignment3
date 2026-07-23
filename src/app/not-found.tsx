import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-text">
      <Compass size={28} className="text-gold" />
      <div className="text-lg font-bold">This page doesn&apos;t exist.</div>
      <div className="max-w-md text-sm text-text-dim">
        Check the link, or head back to your dashboard.
      </div>
      <Link
        href="/dashboard"
        className="rounded-[9px] bg-gold px-4 py-2.5 text-[13.5px] font-bold text-gold-ink hover:brightness-110"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
