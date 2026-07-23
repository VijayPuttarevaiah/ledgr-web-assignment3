"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#0b0b0d", color: "#f2f2ef", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800 }}>LEDGR hit a snag.</div>
          <div style={{ maxWidth: 420, fontSize: 14, color: "#9a9aa4" }}>
            The app failed to render. Nothing was lost — your data lives in the database, not the page. Reloading
            usually fixes this.
          </div>
          <button
            onClick={reset}
            style={{
              background: "#f0a83c",
              color: "#1a1206",
              border: "none",
              borderRadius: 9,
              padding: "10px 18px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
