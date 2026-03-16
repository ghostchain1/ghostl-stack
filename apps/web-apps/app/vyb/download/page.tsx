import { PublicNavbar, PublicFooter } from "@ghostchain/ui";

const DOWNLOADS = [
  {
    name: "iOS",
    href: "/vyb/download/ios",
    accent: "#f8fafc",
    text: "#0A0A0A",
    detail: "App Store release for iPhone and iPad.",
    meta: "App ID 6749217842 · iOS 13+",
  },
  {
    name: "Android",
    href: "/vyb/download/android",
    accent: "#EC4899",
    text: "#ffffff",
    detail: "Google Play release for GhostChain creator streaming.",
    meta: "Package com.ghostchain.litvyblive · Android 5.0+",
  },
];

export default function LitVybLiveDownloadPage() {
  return (
    <>
      <PublicNavbar cta={{ label: "Open LitVyb Live", href: "/vyb" }} />
      <main>
        <section style={{ padding: "100px 24px 56px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#160610 100%)" }}>
          <div className="container">
            <span className="tag">LitVyb Live</span>
            <h1 style={{ fontSize: "clamp(2.25rem,6vw,4.5rem)", fontWeight: 900, margin: "24px 0 16px" }}>
              Download <span style={{ color: "#EC4899" }}>LitVyb Live</span>
            </h1>
            <p style={{ color: "#94a3b8", maxWidth: 720, margin: "0 auto", fontSize: "1.05rem", lineHeight: 1.7 }}>
              GhostChain&apos;s creator economy app lives in the local workspace at <code style={{ color: "#f8fafc" }}>/home/ghost/ghostl-stack/apps/litvyblive/mobile</code>.
              Choose iOS or Android to install the current mobile release.
            </p>
          </div>
        </section>

        <section style={{ padding: "0 24px 80px" }}>
          <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24 }}>
            {DOWNLOADS.map((download) => (
              <div key={download.name} className="card" style={{ borderColor: `${download.accent}44` }}>
                <div style={{ fontSize: "0.78rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b", marginBottom: 14 }}>
                  Mobile Release
                </div>
                <h2 style={{ fontSize: "1.35rem", fontWeight: 800, marginBottom: 8 }}>{download.name}</h2>
                <p style={{ color: "#94a3b8", marginBottom: 10 }}>{download.detail}</p>
                <p style={{ color: "#64748b", fontSize: "0.88rem", marginBottom: 24 }}>{download.meta}</p>
                <a
                  href={download.href}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 180,
                    padding: "14px 20px",
                    borderRadius: 12,
                    background: download.accent,
                    color: download.text,
                    fontWeight: 800,
                    textDecoration: "none",
                  }}
                >
                  Download for {download.name}
                </a>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "0 24px 80px" }}>
          <div className="container card" style={{ color: "#94a3b8", lineHeight: 1.7 }}>
            <strong style={{ color: "#f8fafc" }}>LitVyb Live</strong> is the GhostChain social layer and creator economy app.
            The mobile workspace includes native platform projects under <code style={{ color: "#f8fafc" }}>apps/litvyblive/mobile/ios</code> and <code style={{ color: "#f8fafc" }}>apps/litvyblive/mobile/android</code>,
            with the shared Flutter entrypoint at <code style={{ color: "#f8fafc" }}>apps/litvyblive/mobile/lib/main.dart</code>.
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
