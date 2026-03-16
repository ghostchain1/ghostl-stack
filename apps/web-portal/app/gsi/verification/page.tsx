"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const QUEUE = [
  { subject: "bank.hsbc",          type: "TIER1_BANK",    submitted: "2026-03-13 09:00", docs: 4, status: "under_review" },
  { subject: "fund.singapore.gic", type: "SOVEREIGN_FUND",submitted: "2026-03-13 11:30", docs: 6, status: "under_review" },
  { subject: "reg.esma",           type: "REGULATOR",     submitted: "2026-03-12 14:00", docs: 3, status: "pending_docs" },
  { subject: "bank.barclays",      type: "TIER1_BANK",    submitted: "2026-03-12 16:45", docs: 7, status: "approved" },
];

const STATUS_COLOR: Record<string,string> = {
  under_review: "#f59e0b", pending_docs: "#ef4444", approved: "#10b981",
};
const STATUS_LABEL: Record<string,string> = {
  under_review: "Under Review", pending_docs: "Pending Docs", approved: "✓ Approved",
};

const STEPS = [
  { step: 1, label: "Identity Registration",     desc: "Entity registers via SovereignIdentity contract or GSI API" },
  { step: 2, label: "Document Submission",        desc: "Legal entity documents, licences, and jurisdiction proof uploaded" },
  { step: 3, label: "Credential Verification",   desc: "Authorised verifiers review and validate documentation" },
  { step: 4, label: "On-Chain Approval",          desc: "IdentityRegistry.verify() called — status becomes Verified" },
  { step: 5, label: "System Access Granted",      desc: "GSX, GSN, GCM access unlocked based on institution type" },
];

export default function VerificationPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Control Panel", href: "/" }} />
      <main>
        <section style={{ padding: "100px 24px 60px", background: "linear-gradient(180deg,#07060e,#050507)" }}>
          <div className="container">
            <a href="/gsi" style={{ color: "#8b5cf6", fontSize: "0.85rem", textDecoration: "none" }}>← GSI</a>
            <h1 style={{ fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 800, margin: "16px 0" }}>
              Verification <span style={{ color: "#8b5cf6" }}>Engine</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 600 }}>KYC/KYE pipeline for institutions and governments joining GhostChain. Reviews, approvals, and on-chain credential issuance.</p>
          </div>
        </section>

        <section style={{ padding: "40px 24px" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.2rem", marginBottom: 20 }}>Verification Queue</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {QUEUE.map((q) => (
                <div key={q.subject} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "16px 20px" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#8b5cf6", marginBottom: 4 }}>{q.subject}</div>
                    <div style={{ color: "#64748b", fontSize: "0.8rem" }}>{q.type} · {q.docs} docs · Submitted {q.submitted} UTC</div>
                  </div>
                  <span style={{ background: (STATUS_COLOR[q.status]??"#94a3b8") + "22", color: STATUS_COLOR[q.status]??"#94a3b8", padding: "4px 14px", borderRadius: 12, fontSize: "0.8rem", fontWeight: 700 }}>
                    {STATUS_LABEL[q.status] ?? q.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "40px 24px 80px" }}>
          <div className="container">
            <h2 style={{ fontWeight: 700, fontSize: "1.2rem", marginBottom: 24 }}>Onboarding Flow</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {STEPS.map((s) => (
                <div key={s.step} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 36, height: 36, borderRadius: "50%", background: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.9rem" }}>
                    {s.step}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>{s.desc}</div>
                  </div>
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
