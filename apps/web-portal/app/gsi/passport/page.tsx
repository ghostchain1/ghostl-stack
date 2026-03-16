"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const PASSPORTS = [
  { tokenId: 1,   holder: "0x1aB2...F9c3", country: "USA", issued: "2026-01-10", expires: "2036-01-10", valid: true },
  { tokenId: 2,   holder: "0x3cD4...A1e8", country: "DEU", issued: "2026-01-22", expires: "2036-01-22", valid: true },
  { tokenId: 3,   holder: "0x7eF5...B2d9", country: "JPN", issued: "2026-02-05", expires: "2036-02-05", valid: true },
  { tokenId: 4,   holder: "0x9aA6...C3f0", country: "GBR", issued: "2026-02-18", expires: "2036-02-18", valid: true },
  { tokenId: 5,   holder: "0x2bB7...D4a1", country: "SGP", issued: "2026-03-01", expires: "2036-03-01", valid: true },
];

export default function PassportPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gsi" style={{ color: "#8b5cf6", fontSize: "0.85rem", textDecoration: "none" }}>← GSI</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Digital <span style={{ color: "#8b5cf6" }}>Passport</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>
              Soul-bound sovereign digital identity tokens — non-transferable, government-issued, with biometric commitment proofs stored on-chain. Raw biometric data is never recorded.
            </p>
            <div style={{ display: "inline-block", background: "#8b5cf622", color: "#8b5cf6", padding: "6px 16px", borderRadius: 20, fontSize: "0.8rem", fontWeight: 600, marginTop: 16 }}>
              🔒 Zero-Knowledge Biometric Proofs — No Raw PII On-Chain
            </div>
          </div>
        </section>

        <section style={{ padding: "40px 24px" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
              {PASSPORTS.map((p) => (
                <div key={p.tokenId} className="card" style={{ position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg,#8b5cf6,#3b82f6)" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, letterSpacing: 1 }}>GHOSTCHAIN PASSPORT</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: 4 }}>{p.country}</div>
                    </div>
                    <div style={{ background: "#8b5cf622", color: "#8b5cf6", padding: "4px 12px", borderRadius: 12, fontSize: "0.75rem", fontWeight: 700 }}>
                      #{p.tokenId}
                    </div>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: 6 }}>Holder: <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{p.holder}</span></div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: 6 }}>Issued: {p.issued}</div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: 12 }}>Expires: {p.expires}</div>
                  <span style={{ background: p.valid ? "#10b98122" : "#ef444422", color: p.valid ? "#10b981" : "#ef4444", padding: "3px 12px", borderRadius: 10, fontSize: "0.78rem", fontWeight: 700 }}>
                    {p.valid ? "✓ Valid" : "Revoked"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
