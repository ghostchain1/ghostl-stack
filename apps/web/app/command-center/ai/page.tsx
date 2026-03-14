"use client";
/**
 * /command-center/ai — AI Engine Control Panel
 *
 * Allows authenticated operators to trigger actions on any of the 5 AI
 * microservices (AIMS, VGE, AAE, GEE, AEE) via POST /api/system/action.
 *
 * Authentication: operator enters the GSCC admin token once per session.
 * It is stored in sessionStorage only — never in localStorage or cookies.
 *
 * For production: replace the token gate with a Keycloak-issued JWT and
 * verify it server-side inside /api/system/action.
 */

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActionResult {
  ok: boolean;
  action: string;
  httpStatus?: number;
  result?: unknown;
  error?: string;
}

interface ActionDef {
  id: string;
  label: string;
  description: string;
  params?: Record<string, unknown>;
}

// ── Action catalogue ──────────────────────────────────────────────────────────

const ENGINE_GROUPS: {
  id: string;
  label: string;
  icon: string;
  servicePort: number;
  actions: ActionDef[];
}[] = [
  {
    id: "aims",
    label: "AI Marketing Engine",
    icon: "📣",
    servicePort: 9970,
    actions: [
      { id: "aims-run-campaign",  label: "Run Campaign Cycle",       description: "Trigger a full AI marketing campaign cycle across all channels" },
      { id: "aims-publish-seo",   label: "Publish SEO Content",      description: "Generate and publish AI SEO articles" },
      { id: "aims-outreach",      label: "Run Influencer Outreach",  description: "Scan and contact new influencer prospects" },
    ],
  },
  {
    id: "vge",
    label: "Viral Growth Engine",
    icon: "🚀",
    servicePort: 9971,
    actions: [
      { id: "vge-launch-campaign", label: "Launch Viral Campaign",   description: "Fire a viral growth campaign across supported platforms" },
      { id: "vge-run-airdrop",     label: "Execute Airdrop",         description: "Run the next scheduled GST airdrop round" },
      { id: "vge-create-meme",     label: "Generate AI Meme",        description: "Create & publish a fresh DALL-E meme to social channels" },
    ],
  },
  {
    id: "aae",
    label: "Adoption Engine",
    icon: "🧲",
    servicePort: 9972,
    actions: [
      { id: "aae-dev-scan",        label: "Run Developer Scan",      description: "Scan GitHub for new developer prospects and send outreach" },
      { id: "aae-onboard-projects",label: "Onboard Projects",        description: "Run the project onboarding pipeline" },
      { id: "aae-approve-grants",  label: "Approve Pending Grants",  description: "Auto-approve grants below the threshold budget" },
    ],
  },
  {
    id: "gee",
    label: "Global Expansion Engine",
    icon: "🌍",
    servicePort: 9973,
    actions: [
      { id: "gee-run-listings",    label: "Apply Exchange Listings",   description: "Submit AI-generated listing applications to all target exchanges" },
      { id: "gee-negotiate",       label: "Run Partnership Talks",     description: "Initiate AI negotiation proposals with top partners" },
      { id: "gee-press-release",   label: "Publish Press Release",     description: "Generate and distribute an AI press release" },
    ],
  },
  {
    id: "aee",
    label: "Autonomous Economy Engine",
    icon: "💎",
    servicePort: 9974,
    actions: [
      { id: "aee-burn-tokens",     label: "Trigger Token Burn",        description: "Execute a manual GST burn event" },
      { id: "aee-rebalance-pools", label: "Rebalance Liquidity Pools", description: "Rebalance all liquidity pools to target APR" },
      { id: "aee-adjust-supply",   label: "Run Supply Controller",     description: "Assess pressure ratio and adjust token emissions" },
    ],
  },
  {
    id: "aie",
    label: "Autonomous Infrastructure Engine",
    icon: "🏗",
    servicePort: 9975,
    actions: [
      { id: "aie-repair-run",  label: "Run Auto-Repair Cycle",  description: "Probe all services and repair any failures" },
      { id: "aie-balance-run", label: "Run Resource Balancer",  description: "Assess CPU/memory and emit rebalancing actions" },
      { id: "aie-scaling-run", label: "Run Node Scaler",        description: "Evaluate chain load and trigger scale-out if needed" },
    ],
  },
  {
    id: "ase",
    label: "Autonomous Security Engine",
    icon: "🛡",
    servicePort: 9976,
    actions: [
      { id: "ase-threat-scan",     label: "Run Threat Scan",           description: "Execute full threat detection cycle" },
      { id: "ase-ddos-check",      label: "Run DDoS Analysis",         description: "Analyse rate counters and block abusive IPs" },
      { id: "ase-intrusion-check", label: "Run Intrusion Detection",   description: "Parse auth logs and block brute-force IPs" },
    ],
  },
  {
    id: "gie",
    label: "Ghost Intelligence Engine",
    icon: "🧠",
    servicePort: 9977,
    actions: [
      { id: "gie-collect-data",       label: "Collect Ecosystem Data",   description: "Trigger an immediate ecosystem snapshot collection" },
      { id: "gie-run-predictions",    label: "Run Predictions",          description: "Run 30/60/90-day forecast cycle now" },
      { id: "gie-optimize-decisions", label: "Optimise Decisions",       description: "Generate prioritised action recommendations" },
    ],
  },
  {
    id: "age",
    label: "Autonomous Governance Engine",
    icon: "🗳",
    servicePort: 9978,
    actions: [
      { id: "age-generate-proposal",  label: "Generate Proposal",        description: "Auto-generate a new on-chain governance proposal" },
      { id: "age-run-simulations",    label: "Retrieve Simulations",     description: "Fetch latest policy simulation results" },
      { id: "age-predict-votes",      label: "Predict Votes",            description: "Retrieve AI voting outcome predictions" },
    ],
  },
  {
    id: "giex",
    label: "Interchain Expansion Engine",
    icon: "🌐",
    servicePort: 9979,
    actions: [
      { id: "giex-run-discovery",   label: "Run Chain Discovery",    description: "Scan and score multichain expansion targets" },
      { id: "giex-take-snapshot",   label: "Analytics Snapshot",     description: "Capture live interchain health snapshot" },
      { id: "giex-bridge-stats",    label: "Bridge Statistics",      description: "Retrieve bridge deployment and volume stats" },
    ],
  },
  {
    id: "gaan",
    label: "Autonomous AI Agent Network",
    icon: "🤖",
    servicePort: 9981,
    actions: [
      { id: "gaan-run-coordination", label: "Run Coordination Cycle", description: "Trigger a full agent coordination and task-assignment cycle" },
      { id: "gaan-run-all-agents",   label: "Tick All Agents",        description: "Run one decision cycle across all 7 autonomous agents" },
      { id: "gaan-network-snapshot", label: "Network Snapshot",       description: "Retrieve the latest agent network health snapshot" },
    ],
  },
  {
    id: "ade",
    label: "Autonomous Development Engine",
    icon: "⚙️",
    servicePort: 9982,
    actions: [
      { id: "ade-run-loop",       label: "Run Development Loop",  description: "Trigger the full autonomous: generate → test → audit → deploy cycle" },
      { id: "ade-generate-code",  label: "Generate Code",         description: "AI generates a code improvement for a GhostStack service" },
      { id: "ade-build-contract", label: "Build Contract",        description: "AI builds and compiles a new Solidity smart contract" },
      { id: "ade-trigger-ci",     label: "Trigger CI Pipeline",   description: "Trigger a CI/CD pipeline for a Ghost repository" },
    ],
  },
  {
    id: "ai-evolution",
    label: "Self-Evolution Engine",
    icon: "🧬",
    servicePort: 9983,
    actions: [
      { id: "evo-run-loop",             label: "Run Evolution Loop",       description: "Trigger the full evolution cycle: analyze → upgrade → evolve → optimize → innovate" },
      { id: "evo-analyze-architecture", label: "Analyze Architecture",     description: "Run full ecosystem architecture analysis and health scoring" },
      { id: "evo-propose-upgrade",      label: "Propose Protocol Upgrade", description: "AI proposes a new protocol upgrade for GhostChain/L2/L3" },
      { id: "evo-explore-innovation",   label: "Explore Innovation",       description: "Discover and evaluate emerging blockchain innovations" },
    ],
  },
  {
    id: "pne",
    label: "Planetary Network Engine",
    icon: "🌍",
    servicePort: 9984,
    actions: [
      { id: "pne-run-loop",         label: "Run Planetary Loop",    description: "Trigger planetary loop: monitor → detect → deploy → optimize → sweep" },
      { id: "pne-deploy-node",      label: "Deploy Global Node",    description: "Provision a new blockchain node in an underserved region" },
      { id: "pne-optimize-latency", label: "Optimize Latency",      description: "Run cross-region latency analysis and deploy edge nodes" },
      { id: "pne-monitor-planet",   label: "Monitor Planet Health", description: "Snapshot global network health across all regions" },
    ],
  },
  {
    id: "ine",
    label: "Interplanetary Network Engine",
    icon: "🛰️",
    servicePort: 9985,
    actions: [
      { id: "ine-run-loop",          label: "Run Interplanetary Loop", description: "Trigger space infrastructure loop: monitor → sweep relays → sync comms → update routing" },
      { id: "ine-deploy-satellite",  label: "Deploy Satellite Relay",  description: "Launch a new satellite relay node into orbit" },
      { id: "ine-deploy-validator",  label: "Deploy Orbital Validator",description: "Deploy a censorship-resistant validator into orbital data centre" },
      { id: "ine-sync-comms",        label: "Sync Deep-Space Comms",   description: "Initiate a deep-space communication sync session" },
    ],
  },
  {
    id: "hcl",
    label: "Hypervisor Control Layer",
    icon: "🖥️",
    servicePort: 9986,
    actions: [
      { id: "hcl-run-loop",         label: "Run HCL Loop",           description: "Trigger full HCL autonomous control loop: telemetry → snapshot → recovery → rebalance" },
      { id: "hcl-recovery-run",     label: "Run Recovery Engine",    description: "Detect failures and auto-recover: restart containers, provision replacement nodes" },
      { id: "hcl-deploy-validator", label: "Deploy Validator Node",  description: "Provision a new blockchain validator node on GhostChain, L2, or L3" },
      { id: "hcl-snapshot",         label: "Capture Infra Snapshot", description: "Take an immediate infrastructure health snapshot across all VMs, containers, and nodes" },
    ],
  },
  {
    id: "are",
    label: "Autonomous Revenue Engine",
    icon: "💰",
    servicePort: 9987,
    actions: [
      { id: "are-run-loop",           label: "Run Revenue Loop",         description: "Trigger full ARE loop: manage liquidity → validate rewards → run trading → capture snapshot → auto-distribute" },
      { id: "are-manage-liquidity",   label: "Manage DeFi Liquidity",    description: "Run the DeFi liquidity management cycle across all GhostL2 and GhostChain pools" },
      { id: "are-distribute-revenue", label: "Distribute Revenue",       description: "Distribute accumulated ecosystem revenue: 40% treasury, 30% validators, 30% ecosystem incentives" },
      { id: "are-distribute-rewards", label: "Distribute Validator Rewards", description: "Pay out pending validator block production and staking rewards" },
      { id: "are-run-trading",        label: "Execute Trading Strategies", description: "Run all active algorithmic trading strategies: market-making, arbitrage, liquidity balancing" },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AiControlPanel() {
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [results, setResults] = useState<ActionResult[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  // Restore token from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("gscc_token");
    if (stored) { setToken(stored); setTokenSaved(true); }
  }, []);

  const saveToken = () => {
    if (!tokenInput.trim()) return;
    sessionStorage.setItem("gscc_token", tokenInput.trim());
    setToken(tokenInput.trim());
    setTokenSaved(true);
  };

  const clearToken = () => {
    sessionStorage.removeItem("gscc_token");
    setToken("");
    setTokenInput("");
    setTokenSaved(false);
  };

  const dispatch = useCallback(async (action: ActionDef) => {
    if (!token) return;
    setPending(action.id);
    try {
      const r = await fetch("/api/system/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: action.id, params: action.params ?? {} }),
      });
      const data = (await r.json()) as ActionResult;
      setResults((prev) => [{ ...data, action: action.id }, ...prev.slice(0, 19)]);
    } catch (e) {
      setResults((prev) => [
        { ok: false, action: action.id, error: String(e) },
        ...prev.slice(0, 19),
      ]);
    }
    setPending(null);
  }, [token]);

  const labelFor = (id: string) =>
    ENGINE_GROUPS.flatMap((g) => g.actions).find((a) => a.id === id)?.label ?? id;

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <h1>🤖 AI Engine Control Panel</h1>
        <p>Trigger autonomous actions on any running AI microservice</p>
      </div>

      {/* ── Auth gate ───────────────────────────────────────────────────── */}
      {!tokenSaved ? (
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="card-title">🔐 Admin Token Required</div>
          <p className="text-muted" style={{ margin: "0.6rem 0 1rem" }}>
            Enter the <code>GSCC_SECRET</code> configured on the server. The
            token is kept in session storage only and never sent anywhere except
            the action API.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveToken()}
              placeholder="Paste GSCC_SECRET…"
              style={{
                flex: 1,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                padding: "0.5rem 0.75rem",
                fontSize: "0.9rem",
              }}
            />
            <button className="cmd-btn" onClick={saveToken}>
              Unlock
            </button>
          </div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.65rem 1.25rem",
            marginBottom: "1rem",
          }}
        >
          <span>
            <span className="badge badge-green">
              <span className="dot" /> Authenticated
            </span>
          </span>
          <button
            className="cmd-btn"
            onClick={clearToken}
            style={{ fontSize: "0.8rem" }}
          >
            Clear Token
          </button>
        </div>
      )}

      {/* ── Engine control cards ─────────────────────────────────────────── */}
      {ENGINE_GROUPS.map((engine) => (
        <div key={engine.id} style={{ marginBottom: "1.5rem" }}>
          <p
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "0.6rem",
            }}
          >
            {engine.icon} {engine.label}
            <span
              className="text-muted"
              style={{ fontWeight: 400, marginLeft: "0.5rem", textTransform: "none", letterSpacing: 0 }}
            >
              — port {engine.servicePort}
            </span>
          </p>
          <div className="grid grid-3">
            {engine.actions.map((action) => (
              <div key={action.id} className="card">
                <div className="card-title">{action.label}</div>
                <div
                  className="card-sub text-muted"
                  style={{ margin: "0.4rem 0 0.8rem" }}
                >
                  {action.description}
                </div>
                <button
                  className="cmd-btn"
                  disabled={!tokenSaved || pending !== null}
                  onClick={() => void dispatch(action)}
                  style={{
                    opacity: !tokenSaved || pending !== null ? 0.5 : 1,
                    cursor: !tokenSaved || pending !== null ? "not-allowed" : "pointer",
                  }}
                >
                  {pending === action.id ? "Running…" : "▶ Execute"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ── Action result log ────────────────────────────────────────────── */}
      {results.length > 0 && (
        <>
          <div className="page-header">
            <h1>Execution Log</h1>
            <p>Most recent action results (this session)</p>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table className="service-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Result</th>
                  <th>HTTP</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <code>{labelFor(r.action)}</code>
                    </td>
                    <td>
                      <span
                        className={`badge ${r.ok ? "badge-green" : "badge-red"}`}
                      >
                        {r.ok ? "Success" : "Failed"}
                      </span>
                    </td>
                    <td className="text-muted">{r.httpStatus ?? "—"}</td>
                    <td
                      className="text-muted"
                      style={{ fontSize: "0.8rem", wordBreak: "break-all" }}
                    >
                      {r.error
                        ? r.error.slice(0, 120)
                        : r.result != null
                        ? JSON.stringify(r.result).slice(0, 120)
                        : "—"}
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
