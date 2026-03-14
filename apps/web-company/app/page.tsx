"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const team = [
  { name: "Alex Carter", role: "Chief Executive Officer", bio: "15 years building distributed systems. Former Ethereum core contributor." },
  { name: "Dr. Mia Zhang", role: "Chief AI Officer", bio: "PhD in ML from MIT. Led AI inference infrastructure at scale for Fortune 500 clients." },
  { name: "Rafael Osei", role: "Chief Technology Officer", bio: "Former principal engineer at Solana Foundation. Designed Ghost\'s three-layer consensus." },
  { name: "Sara Khoury", role: "Chief Operating Officer", bio: "10 years in fintech operations. Scaled two blockchain startups to Series B." },
  { name: "Jordan Lee", role: "VP Engineering", bio: "Full-stack blockchain engineer. Core contributor to GhostVM runtime and SDK." },
  { name: "Priya Nair", role: "Head of Legal & Compliance", bio: "Crypto regulatory attorney. Led licensing efforts across 12 jurisdictions." },
];

const values = [
  { icon: "🔓", title: "Open by default", desc: "All protocol code is open source. Trust is built through transparency, not promises." },
  { icon: "🤖", title: "AI-native", desc: "AI is woven into governance, upgrades, and security — not bolted on after the fact." },
  { icon: "🛡️", title: "Self-sovereign", desc: "No admin keys. No foundation override. Governance by token holders, enforced on-chain." },
  { icon: "🌍", title: "Global from day one", desc: "Built for users across every jurisdiction. Censorship-resistant by design." },
];

export default function CompanyPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Join the Team", href: "/careers" }} />
      <main>
        {/* Hero */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#07060e 0%,#050507 100%)" }}>
          <div className="container">
            <span className="tag">About GhostChain</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,4rem)", fontWeight: 800, margin: "24px 0 16px" }}>
              Building the <span style={{ color: "#00F0FF" }}>Autonomous</span> Internet
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 640, margin: "0 auto", fontSize: "1.1rem" }}>
              GhostChain is a team of engineers, researchers, and operators obsessed with making decentralized infrastructure as reliable and fast as the services it replaces.
            </p>
          </div>
        </section>

        {/* Values */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 32, textAlign: "center" }}>What we believe</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 24 }}>
              {values.map((v) => (
                <div key={v.title} className="card">
                  <div style={{ fontSize: "2rem", marginBottom: 12 }}>{v.icon}</div>
                  <h3 style={{ fontWeight: 700, marginBottom: 8 }}>{v.title}</h3>
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Team */}
        <section style={{ padding: "60px 24px", background: "#07060e" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 32, textAlign: "center" }}>Team</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 24 }}>
              {team.map((m) => (
                <div key={m.name} className="card">
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#7A00FF,#00F0FF)", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.25rem", color: "#000" }}>{m.name[0]}</div>
                  <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 4 }}>{m.name}</div>
                  <div style={{ color: "#7A00FF", fontSize: "0.85rem", fontWeight: 600, marginBottom: 10 }}>{m.role}</div>
                  <p style={{ color: "#94a3b8", fontSize: "0.875rem", margin: 0 }}>{m.bio}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Press + Careers */}
        <section style={{ padding: "80px 24px", textAlign: "center" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 32, maxWidth: 720, margin: "0 auto" }}>
              <div className="card" style={{ textAlign: "center" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 12 }}>Press Kit</h3>
                <p style={{ color: "#94a3b8", marginBottom: 20, fontSize: "0.9rem" }}>Logos, brand guidelines, and media contacts.</p>
                <a href="/press" className="btn-secondary">Download Press Kit</a>
              </div>
              <div className="card" style={{ textAlign: "center" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 12 }}>We\'re Hiring</h3>
                <p style={{ color: "#94a3b8", marginBottom: 20, fontSize: "0.9rem" }}>Remote-first positions across engineering, research, and ops.</p>
                <a href="/careers" className="btn-primary">View Open Roles</a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
