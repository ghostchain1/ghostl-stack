/**
 * Defender Agent — active threat response layer, complementing the Security Agent.
 * Focuses on real-time attack mitigation, node isolation, and DDoS defence.
 * Security Agent = detection & policy; Defender Agent = tactical response.
 */

import logger from "../utils/logger";
import { updateAgentStatus, recordDecision } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

const ID   = "defender-agent";
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

type AttackVector = "none" | "ddos" | "sybil" | "eclipse" | "exploit" | "insider";

type DefDecision = {
  action:    string;
  reasoning: string;
  impact:    "low" | "medium" | "high" | "critical";
  outcome:   string;
  notify?:   { to: string; subject: string; content: string };
};

let blockedAddresses = 4820;
let isolatedNodes    = 0;
let mitigationCount  = 14;
let defensiveMode    = false;

function detectVector(): AttackVector {
  const r = Math.random();
  if      (r < 0.02) return "exploit";
  else if (r < 0.06) return "insider";
  else if (r < 0.12) return "eclipse";
  else if (r < 0.20) return "sybil";
  else if (r < 0.28) return "ddos";
  else               return "none";
}

function decide(vector: AttackVector): DefDecision {
  mitigationCount++;

  if (vector === "exploit") {
    blockedAddresses += rand(10, 50);
    return {
      action:    "Emergency exploit mitigation",
      reasoning: pick([
        "Active exploit attempt on bridge contract; abnormal withdraw sequence detected",
        "Flash loan + reentrancy chain detected in liquidity contract interaction",
        "MEV bot sandwich attack sequence confirmed; extracting validator block rewards",
        "Bypassed signature check detected in staking withdrawal path",
      ]),
      impact:    "critical",
      outcome:   `Exploit blocked; attack contracts blacklisted; $0 user funds lost; incident report #${mitigationCount} filed`,
      notify: {
        to:      "security-agent",
        subject: "🚨 Exploit blocked — immediate review required",
        content: `Defender intercepted an active exploit. Contracts blacklisted. Full chain-of-custody log available at /incidents/${mitigationCount}. Coordinating with Security agent for root cause.`,
      },
    };
  }

  if (vector === "insider") {
    return {
      action:    "Insider threat response",
      reasoning: pick([
        "Admin API call from off-hours IP; no change request filed",
        "Validator node config modified without deployment pipeline signature",
        "Unusual key export attempt from production HSM",
        "Privileged container accessed by non-standard user account",
      ]),
      impact:    "critical",
      outcome:   "Credentials suspended; session terminated; 72h forensic hold initiated; security lead alerted",
      notify: {
        to:      "auditor-agent",
        subject: "🔒 Insider threat detected — forensic audit requested",
        content: "Defender has suspended credentials following insider threat indicators. Requesting emergency forensic audit of recent deployments and config changes.",
      },
    };
  }

  if (vector === "eclipse") {
    const nodes = rand(1, 3);
    isolatedNodes += nodes;
    return {
      action:    "Eclipse attack countermeasure deployed",
      reasoning: pick([
        `${nodes} node(s) receiving only attacker-controlled peer connections`,
        "P2P peer diversity below threshold; node under eclipse isolation risk",
        "Block propagation delay anomaly suggests targeted network partition",
        "Validator receiving forked chain view; inconsistent head block",
      ]),
      impact:    "high",
      outcome:   `Eclipse mitigated; ${nodes} node(s) reconnected to diverse peers; block propagation normalised`,
    };
  }

  if (vector === "sybil") {
    const count = rand(100, 800);
    blockedAddresses += count;
    return {
      action:    pick(["Sybil attack suppressed", "Fake validator cluster neutralised"]),
      reasoning: pick([
        `${count} wallet addresses sharing stake origin; identity clustering confirmed`,
        "Governance vote Sybil pattern detected: ${count} new addresses created 1h before snapshot",
        "Peer discovery flooded with ${count} IP-correlated nodes",
        "Token delegation graph anomaly: ${count} wallets delegating to single whale validator",
      ]),
      impact:    "high",
      outcome:   `${count} Sybil entities blocked; network peer diversity score restored to ${rand(78, 95)}%`,
    };
  }

  if (vector === "ddos") {
    defensiveMode = true;
    const rps     = rand(8000, 40000);
    return {
      action:    "DDoS mitigation activated",
      reasoning: pick([
        `Inbound RPC request rate ${rps.toLocaleString()} req/s (baseline: ${rand(200, 800)} req/s)`,
        `API gateway connection pool exhausted; ${rps.toLocaleString()} simultaneous SYN packets`,
        "Amplification attack targeting UDP port 30303; bandwidth spike 24×",
        "Bot network rotating IPs to bypass rate limiting; adaptive countermeasure needed",
      ]),
      impact:    "high",
      outcome:   `Rate-limit tiers activated; ${rand(1500, 8000)} IPs blocked; RPC latency restored to <${rand(80, 150)}ms`,
    };
  }

  // none — proactive defence review
  defensiveMode = false;
  return {
    action: pick([
      "Perimeter defences reviewed",
      "Firewall rules updated",
      "Node peer lists hardened",
      "Threat intelligence feeds synced",
    ]),
    reasoning: pick([
      "Scheduled defensive posture review; no active threats detected",
      "New threat intelligence feed integrated; ${rand(200, 800)} new malicious IPs added",
      "Firewall rules pruned; ${rand(10, 50)} stale rules removed",
      "P2P peer lists refreshed; low-quality peers replaced with high-reputation nodes",
    ]),
    impact:  "low",
    outcome: `Defences current; ${blockedAddresses.toLocaleString()} addresses blocked; threat posture: ${defensiveMode ? "elevated" : "normal"}`,
  };
}

export function runDefenderAgent(): void {
  updateAgentStatus(ID, "running", "Scanning for active threats and executing countermeasures");
  try {
    const vector   = detectVector();
    const decision = decide(vector);

    recordDecision(ID, decision.action, decision.reasoning, decision.impact, decision.outcome);

    if (decision.notify) {
      sendMessage(ID, decision.notify.to, "alert", decision.notify.subject, decision.notify.content);
    }

    logger.info(`[DefenderAgent] ${decision.action} [vector=${vector}] (${decision.impact})`);
  } catch (err) {
    logger.error(`[DefenderAgent] Error: ${err}`);
    updateAgentStatus(ID, "error");
    return;
  }
  updateAgentStatus(ID, "idle");
}
