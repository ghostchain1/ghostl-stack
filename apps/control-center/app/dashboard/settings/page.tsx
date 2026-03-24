// GhostStack C3 — System Settings
"use client";
import { useState } from "react";
import { C3_CONFIG } from "@/config/ghostConfig";

interface SettingSection {
  id:    string;
  label: string;
  icon:  string;
}

const SECTIONS: SettingSection[] = [
  { id: "chains",   label: "Chain Endpoints",     icon: "⛓" },
  { id: "services", label: "Service URLs",         icon: "⚙️" },
  { id: "bridges",  label: "Bridge Contracts",     icon: "🌉" },
  { id: "refresh",  label: "Refresh Intervals",    icon: "🔄" },
  { id: "roles",    label: "Access Control",       icon: "🔒" },
  { id: "about",    label: "About C3",             icon: "ℹ️" },
];

export default function SettingsPage() {
  const [active, setActive] = useState("chains");

  return (
    <>
      <div className="page-header">
        <h1>⚙️ System Settings</h1>
        <p>GhostStack C3 configuration — chain RPCs, service endpoints, refresh intervals, and access control</p>
      </div>

      <div style={{ display: "flex", gap: "1.5rem" }}>
        {/* Settings sidebar */}
        <div style={{ width: "200px", flexShrink: 0 }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                width: "100%", padding: "0.55rem 0.85rem", borderRadius: "6px",
                background: active === s.id ? "rgba(124,58,237,0.15)" : "none",
                border: active === s.id ? "1px solid rgba(124,58,237,0.3)" : "1px solid transparent",
                color: active === s.id ? "var(--text)" : "var(--text-muted)",
                fontSize: "0.82rem", fontWeight: active === s.id ? 700 : 400,
                cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                marginBottom: "0.25rem",
              }}
            >
              <span>{s.icon}</span> {s.label}
            </button>
          ))}
        </div>

        {/* Settings panel */}
        <div style={{ flex: 1 }}>

          {active === "chains" && (
            <div className="card">
              <div className="card-title">Blockchain RPC Endpoints</div>
              <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "rgba(109,229,255,0.07)", border: "1px solid rgba(109,229,255,0.2)", borderRadius: "8px", fontSize: "0.8rem", color: "#9bf0ff" }}>
                Override endpoints via environment variables (NEXT_PUBLIC_GHOSTCHAIN_RPC, etc).
              </div>
              {Object.entries(C3_CONFIG.chains).map(([id, c]) => (
                <div key={id} style={{ marginBottom: "1.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{c.name}</span>
                    <span style={{ fontSize: "0.68rem", padding: "0.1rem 0.4rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text-muted)" }}>chain {c.chainId}</span>
                  </div>
                  <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.5rem 0.75rem", fontFamily: "monospace", fontSize: "0.82rem", color: "var(--cyan)" }}>
                    {c.rpc}
                  </div>
                </div>
              ))}
            </div>
          )}

          {active === "services" && (
            <div className="card">
              <div className="card-title">Service Backend URLs</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {Object.entries(C3_CONFIG.services).map(([key, url]) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid var(--border)", fontSize: "0.82rem" }}>
                    <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{key}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--cyan)", fontSize: "0.78rem" }}>{url}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active === "bridges" && (
            <div className="card">
              <div className="card-title">Canonical Bridge Contract Addresses</div>
              {Object.entries(C3_CONFIG.bridges).map(([key, addr]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "0.45rem 0", borderBottom: "1px solid var(--border)", fontSize: "0.82rem", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 600, flexShrink: 0 }}>{key}</span>
                  <span style={{ fontFamily: "monospace", color: "var(--cyan)", fontSize: "0.74rem", wordBreak: "break-all" }}>{addr}</span>
                </div>
              ))}
            </div>
          )}

          {active === "refresh" && (
            <div className="card">
              <div className="card-title">Auto-Refresh Intervals</div>
              <table className="data-table">
                <thead><tr><th>Dashboard</th><th>Interval</th></tr></thead>
                <tbody>
                  {Object.entries(C3_CONFIG.refreshIntervals).map(([key, ms]) => (
                    <tr key={key}>
                      <td style={{ fontWeight: 600 }}>{key}</td>
                      <td className="mono">{ms / 1000}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
                Override via <code style={{ color: "var(--cyan)" }}>ghostConfig.ts</code>. Settings take effect after restart.
              </div>
            </div>
          )}

          {active === "roles" && (
            <div className="card">
              <div className="card-title">Access Control Roles</div>
              <div style={{ marginBottom: "0.75rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                C3 supports 4 access levels. Authentication is enforced by the compliance API.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                {(["admin","operator","developer","viewer"] as const).map((role, i) => {
                  const descs: Record<string, string> = {
                    admin:     "Full access — all dashboards, control actions, settings",
                    operator:  "Chain ops, validator management, infrastructure restart",
                    developer: "Read access + contract & GNS tools, no infra actions",
                    viewer:    "Read-only access to all dashboards",
                  };
                  const colors = ["var(--red)","var(--yellow)","var(--cyan)","var(--text-muted)"];
                  return (
                    <div key={role} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.85rem 1rem" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem", color: colors[i], marginBottom: "0.3rem" }}>{role}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{descs[role]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {active === "about" && (
            <div className="card">
              <div className="card-title">About GhostStack C3</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {[
                  ["Version",         "C3 v2.0.0"],
                  ["Framework",       "Next.js 14 (App Router)"],
                  ["Port",            "3100"],
                  ["GhostChain L1",   "Chain ID 14000101 · RPC :18545"],
                  ["GhostL2 (OP)",    "Chain ID 901 · RPC :29545"],
                  ["GhostL3 (OP)",    "Chain ID 903 · RPC :39545"],
                  ["Gas Token",       "GST (never ETH/WETH)"],
                  ["GhostBrain",      "Port 7900"],
                  ["Solidity",        "0.8.24 · via_ir=true · runs=200"],
                  ["OZ Contracts",    "v5.6.1 (GhostChain rebranded)"],
                  ["Built",           new Date().toDateString()],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0", borderBottom: "1px solid var(--border)", fontSize: "0.82rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
