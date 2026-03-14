"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const INST_TYPES = ["GOVERNMENT","CENTRAL_BANK","SOVEREIGN_FUND","TIER1_BANK","REGULATOR","AUDITOR"];
const TYPE_COLOR: Record<string,string> = {
  GOVERNMENT: "#8b5cf6", CENTRAL_BANK: "#f59e0b", SOVEREIGN_FUND: "#10b981",
  TIER1_BANK: "#3b82f6", REGULATOR: "#ec4899", AUDITOR: "#94a3b8",
};

const INSTITUTIONS = [
  { name: "gov.us.treasury",      legalName: "US Department of the Treasury",         type: "GOVERNMENT",    jurisdiction: "USA", status: "approved" },
  { name: "bank.ecb",             legalName: "European Central Bank",                  type: "CENTRAL_BANK",  jurisdiction: "EUR", status: "approved" },
  { name: "bank.boj",             legalName: "Bank of Japan",                          type: "CENTRAL_BANK",  jurisdiction: "JPN", status: "approved" },
  { name: "fund.norway.swf",      legalName: "Norges Bank Investment Management",      type: "SOVEREIGN_FUND",jurisdiction: "NOR", status: "approved" },
  { name: "bank.jpmorgan",        legalName: "JPMorgan Chase & Co.",                   type: "TIER1_BANK",    jurisdiction: "USA", status: "approved" },
  { name: "bank.goldmansachs",    legalName: "Goldman Sachs Group, Inc.",              type: "TIER1_BANK",    jurisdiction: "USA", status: "approved" },
  { name: "reg.fca",              legalName: "Financial Conduct Authority",             type: "REGULATOR",     jurisdiction: "GBR", status: "approved" },
  { name: "audit.deloitte",       legalName: "Deloitte Touche Tohmatsu Limited",       type: "AUDITOR",       jurisdiction: "GBR", status: "pending" },
];

export default function InstitutionsPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gsi" style={{ color: "#8b5cf6", fontSize: "0.85rem", textDecoration: "none" }}>← GSI</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Institution <span style={{ color: "#8b5cf6" }}>Registry</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>KYE-verified institutional participants authorised to operate within the GhostChain sovereign financial ecosystem.</p>
          </div>
        </section>

        <section style={{ padding: "24px 24px 12px" }}>
          <div className="container">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {INST_TYPES.map((t) => (
                <span key={t} style={{ background: (TYPE_COLOR[t]??"#94a3b8") + "22", color: TYPE_COLOR[t]??"#94a3b8", padding: "4px 14px", borderRadius: 12, fontSize: "0.78rem", fontWeight: 700 }}>{t}</span>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "24px 24px 80px" }}>
          <div className="container">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b" }}>
                    {["Name (GNS)", "Legal Entity", "Type", "Jurisdiction", "Status"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {INSTITUTIONS.map((inst) => (
                    <tr key={inst.name} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#8b5cf6" }}>{inst.name}</td>
                      <td style={{ padding: "12px 16px", color: "#cbd5e1" }}>{inst.legalName}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: (TYPE_COLOR[inst.type]??"#94a3b8") + "22", color: TYPE_COLOR[inst.type]??"#94a3b8", padding: "2px 10px", borderRadius: 10, fontSize: "0.78rem", fontWeight: 700 }}>{inst.type}</span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{inst.jurisdiction}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: inst.status === "approved" ? "#10b98122" : "#f59e0b22", color: inst.status === "approved" ? "#10b981" : "#f59e0b", padding: "2px 10px", borderRadius: 10, fontSize: "0.78rem", fontWeight: 700 }}>
                          {inst.status === "approved" ? "✓ Approved" : "Pending"}
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
