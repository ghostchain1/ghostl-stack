"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const CREDS = [
  { id: 1, type: "CENTRAL_BANK_LICENSE",  subject: "bank.ecb",        issuer: "ghostchain-governance", issued: "2026-01-15", expires: "2031-01-15", valid: true },
  { id: 2, type: "SOVEREIGN_FUND_AUTH",   subject: "fund.norway.swf",  issuer: "ghostchain-governance", issued: "2026-02-01", expires: "2031-02-01", valid: true },
  { id: 3, type: "TIER1_BANK_ACCESS",     subject: "bank.jpmorgan",    issuer: "ghostchain-governance", issued: "2026-02-14", expires: "2029-02-14", valid: true },
  { id: 4, type: "AUDITOR_CERTIFICATION", subject: "audit.deloitte",   issuer: "reg.fca",              issued: "2026-03-01", expires: "2027-03-01", valid: true },
  { id: 5, type: "EXCHANGE_PARTICIPANT",  subject: "bank.goldmansachs",issuer: "ghostchain-governance", issued: "2026-03-10", expires: "2027-03-10", valid: true },
];

export default function CredentialsPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gsi" style={{ color: "#8b5cf6", fontSize: "0.85rem", textDecoration: "none" }}>← GSI</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Credential <span style={{ color: "#8b5cf6" }}>System</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>On-chain verifiable credentials — banking licences, exchange access, auditor certifications, and sovereign fund authorisations.</p>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b" }}>
                    {["ID", "Type", "Subject", "Issuer", "Issued", "Expires", "Status"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CREDS.map((c) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "12px 16px", color: "#64748b" }}>#{c.id}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#8b5cf6", fontSize: "0.8rem" }}>{c.type}</td>
                      <td style={{ padding: "12px 16px", color: "#cbd5e1" }}>{c.subject}</td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "0.8rem" }}>{c.issuer}</td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "0.8rem" }}>{c.issued}</td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "0.8rem" }}>{c.expires}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: c.valid ? "#10b98122" : "#ef444422", color: c.valid ? "#10b981" : "#ef4444", padding: "2px 10px", borderRadius: 10, fontSize: "0.78rem", fontWeight: 700 }}>
                          {c.valid ? "✓ Valid" : "Revoked"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
