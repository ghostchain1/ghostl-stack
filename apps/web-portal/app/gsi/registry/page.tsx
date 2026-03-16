"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const ID_TYPES = ["GOVERNMENT","CENTRAL_BANK","INSTITUTION","CORPORATION","CITIZEN","DEVICE","AI_AGENT"];
const TYPE_COLOR: Record<string,string> = {
  GOVERNMENT: "#8b5cf6", CENTRAL_BANK: "#f59e0b", INSTITUTION: "#10b981",
  CORPORATION: "#3b82f6", CITIZEN: "#94a3b8", DEVICE: "#64748b", AI_AGENT: "#ec4899",
};

const SAMPLE = [
  { name: "gov.us.treasury",       type: "GOVERNMENT",   addr: "0x1aB2...F9c3", verified: true },
  { name: "bank.ecb",              type: "CENTRAL_BANK", addr: "0x3cD4...A1e8", verified: true },
  { name: "bank.jpmorgan",         type: "INSTITUTION",  addr: "0x7eF5...B2d9", verified: true },
  { name: "fund.norway.swf",       type: "INSTITUTION",  addr: "0x9aA6...C3f0", verified: true },
  { name: "citizen.usa.847294",    type: "CITIZEN",      addr: "0x2bB7...D4a1", verified: true },
  { name: "ai.market-monitor",     type: "AI_AGENT",     addr: "0x4cC8...E5b2", verified: false },
  { name: "device.energy-grid-tx", type: "DEVICE",       addr: "0x6dD9...F6c3", verified: false },
];

export default function RegistryPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gsi" style={{ color: "#8b5cf6", fontSize: "0.85rem", textDecoration: "none" }}>← GSI</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Identity <span style={{ color: "#8b5cf6" }}>Registry</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>All sovereign identities registered on GhostChain L1 — governments, banks, corporations, citizens, devices, and AI agents.</p>
          </div>
        </section>

        <section style={{ padding: "24px 24px 12px" }}>
          <div className="container">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {ID_TYPES.map((t) => (
                <span key={t} style={{ background: (TYPE_COLOR[t] ?? "#94a3b8") + "22", color: TYPE_COLOR[t] ?? "#94a3b8", padding: "4px 14px", borderRadius: 12, fontSize: "0.78rem", fontWeight: 700 }}>{t}</span>
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
                    {["Name (GNS)", "Type", "Address", "Status"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE.map((id) => (
                    <tr key={id.name} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 600, color: "#8b5cf6" }}>{id.name}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: (TYPE_COLOR[id.type]??"#94a3b8") + "22", color: TYPE_COLOR[id.type]??"#94a3b8", padding: "2px 10px", borderRadius: 10, fontSize: "0.78rem", fontWeight: 700 }}>{id.type}</span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#64748b", fontFamily: "monospace" }}>{id.addr}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: id.verified ? "#10b98122" : "#f59e0b22", color: id.verified ? "#10b981" : "#f59e0b", padding: "2px 10px", borderRadius: 10, fontSize: "0.78rem", fontWeight: 700 }}>
                          {id.verified ? "✓ Verified" : "Pending"}
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
