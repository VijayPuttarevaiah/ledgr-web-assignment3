const FEATURES = [
  { label: "Personal Ledger", color: "var(--color-gold)" },
  { label: "Split Studio", color: "var(--color-teal)" },
  { label: "Analytics Hub", color: "var(--color-teal)" },
  { label: "AI Features", color: "var(--color-coral)" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg text-text">
      <div className="hidden flex-1 flex-col justify-center border-r border-border p-14 md:flex">
        <div className="text-[52px] leading-none font-black tracking-tight">LEDGR</div>
        <div className="my-3.5 h-[3px] w-16 bg-gold" />
        <div className="mb-2.5 text-[26px] leading-tight text-[#d8d8d4]">
          Every dollar.
          <br />
          Every split.
          <br />
          One place.
        </div>
        <div className="mb-8 text-sm text-text-dim">
          Personal finance + collaborative bill-splitting + AI analytics. Finally unified.
        </div>
        {FEATURES.map((f) => (
          <div key={f.label} className="mb-3 flex items-center gap-2.5 text-sm text-[#c8c8c4]">
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: f.color }} />
            {f.label}
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col justify-center p-8 md:mx-auto md:max-w-[460px] md:p-14">{children}</div>
    </div>
  );
}
