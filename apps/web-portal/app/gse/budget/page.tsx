"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const BUDGETS = [
  { id: 1, category: "Infrastructure", allocated: "$500B", spent: "$120B", pct: 24 },
  { id: 2, category: "Defence",        allocated: "$880B", spent: "$410B", pct: 47 },
  { id: 3, category: "Healthcare",     allocated: "$1.8T", spent: "$890B", pct: 49 },
  { id: 4, category: "Education",      allocated: "$800B", spent: "$310B", pct: 39 },
  { id: 5, category: "Research",       allocated: "$200B", spent: "$55B",  pct: 28 },
];

export default function BudgetPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gse" style={{ color: "#10b981", fontSize: "0.85rem", textDecoration: "none" }}>← GSE</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Budget <span style={{ color: "#10b981" }}>Management</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>Sovereign budget allocations with on-chain disbursement and real-time spend tracking.</p>
          </div>
        </section>

        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {BUDGETS.map((b) => (
                <div key={b.id} className="card" style={{ padding: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontWeight: 700, margin: 0 }}>{b.category}</h3>
                    <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{b.spent} / {b.allocated}</span>
                  </div>
                  <div style={{ background: "#0f172a", borderRadius: 8, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${b.pct}%`, height: "100%", background: "#10b981", borderRadius: 8 }} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#64748b", textAlign: "right" }}>{b.pct}% utilised</div>
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
