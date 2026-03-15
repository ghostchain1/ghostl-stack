"use client";
import { PublicNavbar, PublicFooter } from "@ghostl/ui";

const features = [
  { icon: "🎥", title: "Live Streaming", desc: "Broadcast in 4K with ultra-low latency powered by GhostChain L3 WebRTC settlement." },
  { icon: "💫", title: "3D Gift Engine", desc: "Send animated GST gifts and NFT drops to creators in real-time during live rooms." },
  { icon: "🏆", title: "Creator Leagues", desc: "Compete in weekly leagues, earn GST salary, and climb global rankings." },
  { icon: "🤖", title: "AI Matchmaking", desc: "GhostBrain paired you with creators and rooms tuned to your vibe." },
  { icon: "🌐", title: "Metaverse Rooms", desc: "Host and watch in avatar-powered 3D social spaces." },
  { icon: "⚡", title: "Instant GST Payouts", desc: "Creators receive GST per-second via on-chain treasury settlement." },
  { icon: "🎮", title: "PK Battles", desc: "Creator vs creator live battles with real-time voting and GST wagers." },
  { icon: "🚀", title: "Token Launchpad", desc: "Launch, vest, and distribute your own creator token directly in-app." },
];

const stats = [
  { value: "50K+", label: "Creators" },
  { value: "2M+", label: "GST Gifted Daily" },
  { value: "< 200ms", label: "Latency" },
  { value: "L3", label: "GhostChain Powered" },
];

export default function VybPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Launch Web App", href: "https://apps.ghostchain.cloud/vyb" }} />
      <main>
        {/* Hero */}
        <section style={{ padding: "100px 24px 80px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#12040A 100%)" }}>
          <div className="container">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#EC489922", border: "1px solid #EC489944", borderRadius: 20, padding: "4px 14px", marginBottom: 24 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#EC4899", display: "inline-block", animation: "pulse 2s infinite" }} />
              <span style={{ color: "#EC4899", fontSize: "0.8rem", fontWeight: 600 }}>Live Now on GhostChain</span>
            </div>
            <h1 style={{ fontSize: "clamp(2.5rem,8vw,5rem)", fontWeight: 900, margin: "0 0 12px", lineHeight: 1.05 }}>
              <span style={{ color: "#EC4899" }}>GhostVyb</span>
            </h1>
            <p style={{ fontSize: "1.1rem", color: "#94a3b8", marginBottom: 8 }}>
              powered by <strong style={{ color: "#f1f5f9" }}>LitVybz Live</strong>
            </p>
            <p style={{ color: "#64748b", maxWidth: 540, margin: "0 auto 48px", fontSize: "1.05rem", lineHeight: 1.7 }}>
              The first live streaming platform where every gift, battle, and membership is settled on-chain.
              Earn GST in real time. Truly own your creator economy.
            </p>

            {/* Download CTAs */}
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
              <a
                href="/vyb/download/ios"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  background: "#f1f5f9", color: "#0A0A0A",
                  borderRadius: 12, padding: "14px 28px",
                  textDecoration: "none", fontWeight: 700, fontSize: "1rem",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.1)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Download for iOS
              </a>
              <a
                href="/vyb/download/android"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  background: "#EC4899", color: "#fff",
                  borderRadius: 12, padding: "14px 28px",
                  textDecoration: "none", fontWeight: 700, fontSize: "1rem",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.18 23.76c.3.17.64.22.99.14l12.12-6.98-2.76-2.76-10.35 9.6zM20.73 10.3L17.6 8.47 14.57 11.5l3.03 3.03 3.15-1.84a1.76 1.76 0 0 0 0-2.4zM2.09.27A1.78 1.78 0 0 0 1.8 1.2v21.6c0 .35.1.67.28.94l.1.1L13.8 12l-.01-.09L2.09.27zm2.52-.14L16.73 6.9 13.97 9.65 3.62.37l.99-.24z"/>
                </svg>
                Download for Android
              </a>
              <a
                href="https://apps.ghostchain.cloud/vyb"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  background: "transparent", color: "#EC4899",
                  border: "1px solid #EC489966",
                  borderRadius: 12, padding: "14px 28px",
                  textDecoration: "none", fontWeight: 700, fontSize: "1rem",
                }}
              >
                Open Web App →
              </a>
            </div>

            <p style={{ color: "#475569", fontSize: "0.8rem" }}>
              Package ID: <code style={{ color: "#64748b" }}>com.ghostchain.litvyblive</code> · Requires iOS 13+ / Android 5.0+
            </p>
          </div>
        </section>

        {/* Stats */}
        <section style={{ padding: "60px 24px", borderTop: "1px solid #1e293b", borderBottom: "1px solid #1e293b" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 32, textAlign: "center" }}>
              {stats.map((s) => (
                <div key={s.label}>
                  <div style={{ fontSize: "2rem", fontWeight: 800, color: "#EC4899", marginBottom: 6 }}>{s.value}</div>
                  <div style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section style={{ padding: "80px 24px" }}>
          <div className="container">
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, textAlign: "center", marginBottom: 12 }}>
              Everything a creator needs. On-chain.
            </h2>
            <p style={{ color: "#64748b", textAlign: "center", marginBottom: 56, fontSize: "1rem" }}>
              Built on GhostChain L3 — every interaction is verifiable, instant, and creator-owned.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 24 }}>
              {features.map((f) => (
                <div key={f.title} className="card">
                  <div style={{ fontSize: "2rem", marginBottom: 12 }}>{f.icon}</div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ color: "#64748b", fontSize: "0.88rem", lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Download CTA */}
        <section style={{ padding: "80px 24px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%, #1a0412 100%)" }}>
          <div className="container">
            <h2 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: 16 }}>
              Start earning <span style={{ color: "#EC4899" }}>GST</span> today
            </h2>
            <p style={{ color: "#64748b", marginBottom: 40, maxWidth: 480, margin: "0 auto 40px" }}>
              Download LitVybz Live and join the GhostChain creator economy. Every gift, battle win, and league reward is real on-chain value.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/vyb/download/ios" className="btn-primary" style={{ background: "#EC4899", borderColor: "#EC4899" }}>
                ⬇ iOS — App Store
              </a>
              <a href="/vyb/download/android" className="btn-secondary" style={{ borderColor: "#EC4899", color: "#EC4899" }}>
                ⬇ Android — Play Store
              </a>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
