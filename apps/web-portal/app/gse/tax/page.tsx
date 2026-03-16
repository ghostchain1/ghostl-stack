"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const POLICIES = [
  { nation: "United States", income: "22%", corp: "21%", vat: "0%",  tariff: "3%" },
  { nation: "Germany",       income: "42%", corp: "15%", vat: "19%", tariff: "2%" },
  { nation: "Japan",         income: "45%", corp: "23%", vat: "10%", tariff: "4%" },
  { nation: "Singapore",     income: "22%", corp: "17%", vat: "9%",  tariff: "0%" },
];

export default function TaxPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gse" style={{ color: "#10b981", fontSize: "0.85rem", textDecoration: "none" }}>← GSE</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Tax <span style={{ color: "#10b981" }}>System</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>
              Programmable sovereign tax policies with on-chain collection flowing directly to national treasuries.
            </p>
          </div>
        </section>

        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 24 }}>Active Tax Policies</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
              {POLICIES.map((p) => (
                <div key={p.nation} className="card">
                  <h3 style={{ fontWeight: 700, marginBottom: 16, color: "#10b981" }}>{p.nation}</h3>
                  {[["Income Tax",    p.income],
                    ["Corporate Tax", p.corp],
                    ["VAT",           p.vat],
                    ["Trade Tariff",  p.tariff]].map(([label, val]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "0.9rem" }}>
                      <span style={{ color: "#64748b" }}>{label}</span>
                      <span style={{ fontWeight: 700 }}>{val}</span>
                    </div>
                  ))}
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
