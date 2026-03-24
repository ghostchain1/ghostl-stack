// GhostStack — User Profile
"use client";
import { useState } from "react";

export default function ProfilePage() {
  const [tab, setTab] = useState<"account"|"security"|"notifications">("account");

  return (
    <>
      <div className="page-header">
        <h1>👤 Profile</h1>
        <p>Manage your GhostWallet account, security settings, and notification preferences</p>
      </div>

      {/* Avatar card */}
      <div className="card" style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1.25rem" }}>
        <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", flexShrink: 0 }}>
          👻
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>GhostUser</div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "monospace" }}>ghost1abc…xyz</div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
            <span className="badge badge-green">✓ Verified</span>
            <span className="badge badge-purple">Validator</span>
            <span className="badge badge-gray">L1 · L2 · L3</span>
          </div>
        </div>
        <button className="btn btn-ghost">Edit Profile</button>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab-btn ${tab==="account"?"active":""}`}       onClick={()=>setTab("account")}>Account</button>
        <button className={`tab-btn ${tab==="security"?"active":""}`}      onClick={()=>setTab("security")}>Security</button>
        <button className={`tab-btn ${tab==="notifications"?"active":""}`} onClick={()=>setTab("notifications")}>Notifications</button>
      </div>

      {tab === "account" && (
        <div className="card">
          <div className="card-title">Account Details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[
              { label: "Display Name",    value: "GhostUser",              type: "text" },
              { label: "Email",           value: "user@ghostchain.cloud",  type: "email" },
              { label: "Wallet Address",  value: "ghost1abc…xyz",          type: "text", mono: true },
              { label: "GNS Name",        value: "ghostuser.ghost",        type: "text", mono: true },
            ].map(f => (
              <div key={f.label}>
                <div className="bridge-input-label">{f.label}</div>
                <input
                  type={f.type}
                  defaultValue={f.value}
                  className="bridge-input"
                  style={f.mono ? { fontFamily: "monospace" } : {}}
                />
              </div>
            ))}
            <div>
              <button className="bridge-submit" style={{ maxWidth: "200px" }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {tab === "security" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card">
            <div className="card-title">Authentication</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { label: "Password",           status: "Set", action: "Change", color: "var(--green)" },
                { label: "Two-Factor Auth",    status: "Enabled", action: "Manage", color: "var(--green)" },
                { label: "Hardware Key (FIDO2)", status: "Not set", action: "Add", color: "var(--yellow)" },
                { label: "Passphrase",         status: "Set", action: "Rotate", color: "var(--green)" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontWeight: 600 }}>{r.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontSize: "0.78rem", color: r.color }}>{r.status}</span>
                    <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0.25rem 0.6rem" }}>{r.action}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Active Sessions</div>
            {[
              { device: "Chrome · Linux", ip: "192.168.1.1",   last: "Now",     current: true },
              { device: "Mobile · iOS",   ip: "10.0.0.2",      last: "2h ago",  current: false },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0", borderBottom: "1px solid var(--border)", fontSize: "0.82rem" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.device} {s.current && <span style={{ color: "var(--green)", fontSize: "0.68rem" }}>(current)</span>}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{s.ip} · {s.last}</div>
                </div>
                {!s.current && <button className="btn btn-red" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}>Revoke</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "notifications" && (
        <div className="card">
          <div className="card-title">Notification Preferences</div>
          {[
            { label: "Governance proposals",      desc: "New proposals and vote reminders",     on: true },
            { label: "Staking rewards",           desc: "When rewards are ready to claim",       on: true },
            { label: "Bridge transactions",       desc: "Bridge completion and failure alerts",  on: true },
            { label: "Security alerts",           desc: "Unusual account activity warnings",     on: true },
            { label: "Price alerts",              desc: "GST price movement notifications",       on: false },
            { label: "System announcements",      desc: "GhostChain upgrade and maintenance",    on: true },
          ].map((n, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{n.label}</div>
                <div style={{ fontSize: "0.73rem", color: "var(--text-muted)" }}>{n.desc}</div>
              </div>
              <div style={{
                width: "40px", height: "22px", borderRadius: "11px",
                background: n.on ? "var(--green)" : "var(--border)",
                position: "relative", cursor: "pointer", transition: "background 0.15s", flexShrink: 0,
              }}>
                <div style={{
                  position: "absolute", top: "3px",
                  left: n.on ? "21px" : "3px",
                  width: "16px", height: "16px", borderRadius: "50%",
                  background: "#fff", transition: "left 0.15s",
                }} />
              </div>
            </div>
          ))}
          <button className="bridge-submit" style={{ maxWidth: "180px", marginTop: "1rem" }}>Save Preferences</button>
        </div>
      )}
    </>
  );
}
