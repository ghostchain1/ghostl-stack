/**
 * /command-center — Ghost Super AI Control Center (GSCC)
 *
 * Main mission-control overview. Server component for fast SSR initial load;
 * embeds GsccStatusPanel (client) for live 10-second polling of service health.
 *
 * Sections:
 *   1. Top-line KPIs            — control plane, orchestrator, commands, treasury
 *   2. Live Service Status      — GsccStatusPanel (auto-refreshes every 10 s)
 *   3. Control Panels           — quick-link cards for sub-pages
 *   4. All Dashboards           — full ecosystem navigation grid
 *   5. Recent Commands          — last 5 UO command history entries
 */

import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/MetricCard";
import { GsccStatusPanel } from "./GsccStatusPanel";
import {
  fetchScpHealth,
  fetchScpStats,
  fetchAeeSummary,
} from "@/lib/api";
import {
  fetchUoHealth,
  fetchUoCommands,
  fetchUoSystems,
} from "@/lib/ghostbrainApi";

export const metadata: Metadata = {
  title: "Command Center · GhostStack",
  description: "Ghost Super AI Control Center — unified mission control",
};

export default async function CommandCenterPage() {
  const [scpHealth, scpStats, uoHealth, uoCmds, uoSystems, aeeSummary] =
    await Promise.all([
      fetchScpHealth(),
      fetchScpStats(),
      fetchUoHealth(),
      fetchUoCommands(5),
      fetchUoSystems(),
      fetchAeeSummary(),
    ]);

  const connectedSystems =
    uoSystems?.total ?? Object.keys(uoSystems?.systems ?? {}).length;
  const recentCmds = uoCmds?.history ?? [];
  const treasuryUSD = aeeSummary?.treasury?.totalUSD;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <h1>
          Ghost Super AI Control Center
          <span className="live-dot" style={{ marginLeft: "0.75rem" }} />
        </h1>
        <p>
          Unified mission control — monitor and command the entire GhostStack
          ecosystem in real time
        </p>
      </div>

      {/* ── Top-line KPIs ──────────────────────────────────────────────── */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Control Plane</div>
          <div className="card-value">
            <span
              className={`badge ${scpHealth ? "badge-green" : "badge-red"}`}
            >
              <span className="dot" />
              {scpHealth ? "Online" : "Offline"}
            </span>
          </div>
          <div className="card-sub text-muted">
            Cycle #{scpStats?.cycleCount ?? "—"}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Orchestrator</div>
          <div className="card-value">
            <span
              className={`badge ${uoHealth?.ok ? "badge-green" : "badge-red"}`}
            >
              <span className="dot" />
              {uoHealth?.ok ? "Active" : "Degraded"}
            </span>
          </div>
          <div className="card-sub text-muted">
            {connectedSystems > 0 ? `${connectedSystems} connected systems` : "—"}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Commands Routed</div>
          <div className="card-value">{scpStats?.commandsRouted ?? "—"}</div>
          <div className="card-sub text-muted">All-time total</div>
        </div>

        <div className="card">
          <div className="card-title">AEE Treasury TVL</div>
          <div className="card-value" style={{ color: "var(--accent)" }}>
            {treasuryUSD != null
              ? `$${(treasuryUSD / 1_000_000).toFixed(2)} M`
              : "—"}
          </div>
          <div className="card-sub text-muted">Managed by AEE</div>
        </div>
      </div>

      {/* ── Live service status (polling every 10 s) ─────────────────── */}
      <SectionHeader title="Live Service Status" live />
      <GsccStatusPanel />

      {/* ── Control Panels ─────────────────────────────────────────────── */}
      <SectionHeader title="Control Panels" sub="Direct access to management interfaces" />
      <div className="grid grid-3">
        {([
          {
            href: "/command-center/ai",
            icon: "🤖",
            title: "AI Engine Control",
            sub: "Launch campaigns, run scans, trigger burns, rebalance pools",
          },
          {
            href: "/command-center/logs",
            icon: "📡",
            title: "Live Telemetry Stream",
            sub: "Real-time event feed from all GhostStack services",
          },
          {
            href: "/command-hub",
            icon: "⚡",
            title: "Command Hub",
            sub: "Dispatch commands to any GhostBrain subsystem via UO",
          },
          {
            href: "/blockchain",
            icon: "⛓",
            title: "Blockchain Monitor",
            sub: "Chain health, block production, validators, gas, TPS",
          },
          {
            href: "/economy",
            icon: "💰",
            title: "Economy Dashboard",
            sub: "Treasury, tokenomics, liquidity pools, market intelligence",
          },
          {
            href: "/orchestrator",
            icon: "🔀",
            title: "Orchestrator",
            sub: "System orchestration, scheduling, task queue status",
          },
        ] as const).map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="card card-link"
            style={{ textDecoration: "none" }}
          >
            <div className="card-title">
              {link.icon} {link.title}
            </div>
            <div className="card-sub text-muted" style={{ marginTop: "0.4rem" }}>
              {link.sub}
            </div>
          </a>
        ))}
      </div>

      {/* ── Full ecosystem navigation ───────────────────────────────────── */}
      <SectionHeader title="All Dashboards" sub="Browse by domain" />
      <div className="grid grid-4">
        {([
          // Growth engines
          { href: "/marketing",    label: "AI Marketing",     badge: "AIMS",  color: "badge-green" },
          { href: "/growth",       label: "Viral Growth",     badge: "VGE",   color: "badge-green" },
          { href: "/adoption",     label: "Adoption",         badge: "AAE",   color: "badge-green" },
          { href: "/expansion",    label: "Expansion",        badge: "GEE",   color: "badge-green" },
          { href: "/aee",          label: "Economy Engine",   badge: "AEE",   color: "badge-green" },
          // Blockchain
          { href: "/blockchain",   label: "Blockchain",       badge: "L1/L2/L3", color: "badge-green" },
          { href: "/multichain",   label: "Multichain",       badge: "MC",    color: "badge-green" },
          { href: "/validators",   label: "Validators",       badge: "VF",    color: "badge-green" },
          // AI
          { href: "/ai",           label: "AI System",        badge: "AIM",   color: "badge-green" },
          { href: "/kernel",       label: "Kernel",           badge: "KRN",   color: "badge-green" },
          { href: "/intelligence", label: "Intelligence",     badge: "GIN",   color: "badge-green" },
          { href: "/evolution",    label: "Evolution",        badge: "EVO",   color: "badge-green" },
          // Economy
          { href: "/economy",      label: "Economy",          badge: "EIE",   color: "badge-green" },
          { href: "/simulation",   label: "SimLab",           badge: "SEE",   color: "badge-green" },
          { href: "/governance",   label: "Governance",       badge: "GOV",   color: "badge-green" },
          { href: "/data-mesh",    label: "Data Mesh",        badge: "DM",    color: "badge-green" },
          // Security & Ops
          { href: "/security",     label: "Security",         badge: "TDS",   color: "badge-green" },
          { href: "/compliance",   label: "Compliance",       badge: "ACGE",  color: "badge-green" },
          { href: "/devops",       label: "DevOps",           badge: "OPS",   color: "badge-green" },
          { href: "/copilot",      label: "AI Copilot",       badge: "AIOC",  color: "badge-green" },
        ] as const).map((d) => (
          <a
            key={d.href}
            href={d.href}
            className="card card-link"
            style={{ textDecoration: "none" }}
          >
            <div className="card-title">{d.label}</div>
            <div style={{ marginTop: "0.3rem" }}>
              <span
                className={`badge ${d.color}`}
                style={{ fontSize: "0.7rem" }}
              >
                {d.badge}
              </span>
            </div>
          </a>
        ))}
      </div>

      {/* ── Recent commands from Orchestrator ──────────────────────────── */}
      {recentCmds.length > 0 && (
        <>
          <SectionHeader
            title="Recent Commands"
            sub="Last 5 dispatched through the Universal Orchestrator"
          />
          <div className="card" style={{ padding: 0 }}>
            <table className="service-table">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {recentCmds.map((cmd) => (
                  <tr key={cmd.id}>
                    <td>
                      <code>{cmd.target}</code>
                    </td>
                    <td>{cmd.action}</td>
                    <td>
                      <span
                        className={`badge ${
                          cmd.status === "completed"
                            ? "badge-green"
                            : cmd.status === "failed"
                            ? "badge-red"
                            : "badge-yellow"
                        }`}
                      >
                        {cmd.status}
                      </span>
                    </td>
                    <td className="text-muted">
                      {new Date(cmd.issuedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
