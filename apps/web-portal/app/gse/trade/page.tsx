"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const TRADES = [
  { id: 1, exporter: "gov.us",     importer: "gov.eu",  commodity: "OIL",     value: "$4.2B",  status: "settled" },
  { id: 2, exporter: "gov.no",     importer: "gov.de",  commodity: "GAS",     value: "$1.7B",  status: "settled" },
  { id: 3, exporter: "gov.au",     importer: "gov.cn",  commodity: "LITHIUM", value: "$610M",  status: "pending" },
  { id: 4, exporter: "gov.br",     importer: "gov.us",  commodity: "WHEAT",   value: "$280M",  status: "settled" },
  { id: 5, exporter: "gov.sa",     importer: "gov.jp",  commodity: "OIL",     value: "$8.1B",  status: "pending" },
];

const STATUS_COLOR: Record<string, string> = { settled: "#10b981", pending: "#f59e0b", disputed: "#ef4444" };

export default function TradePage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gse" style={{ color: "#10b981", fontSize: "0.85rem", textDecoration: "none" }}>← GSE</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Trade <span style={{ color: "#10b981" }}>Network</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>Sovereign bilateral trade flows settled atomically through GSN with CBDC payment rails.</p>
          </div>
        </section>

        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b" }}>
                    {["ID", "Exporter", "Importer", "Commodity", "Value", "Status"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TRADES.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "12px 16px", color: "#64748b" }}>#{t.id}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>{t.exporter}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>{t.importer}</td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{t.commodity}</td>
                      <td style={{ padding: "12px 16px", color: "#10b981", fontWeight: 700 }}>{t.value}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: STATUS_COLOR[t.status] + "22", color: STATUS_COLOR[t.status], padding: "3px 10px", borderRadius: 12, fontSize: "0.8rem", fontWeight: 600 }}>
                          {t.status}
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
