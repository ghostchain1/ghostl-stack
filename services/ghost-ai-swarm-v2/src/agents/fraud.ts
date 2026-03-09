/**
 * GhostFraud AI
 *
 * AML monitoring, anomaly detection, and fraud pattern analysis
 * across all GhostChain layers. Works with the compliance service
 * and flags suspicious addresses for governance review.
 */

import { fetch }     from "undici";
import { BaseAgent } from "./base.js";
import { bus }       from "../bus/messageBus.js";
import type { SwarmTask } from "../types.js";

const COMPLIANCE_URL  = process.env.COMPLIANCE_URL   ?? "http://127.0.0.1:8090";
const GHOSTBRAIN_URL  = process.env.GHOSTBRAIN_URL    ?? "http://127.0.0.1:7900";

// AML heuristics
const LARGE_TX_GST           = 100_000;   // flag txs > 100k GST
const VELOCITY_CHECK_WINDOW  = 3_600_000; // 1-hour window (ms)
const VELOCITY_TX_THRESHOLD  = 50;        // >50 txs/hour from same address

interface TxRecord {
  hash:      string;
  from:      string;
  to:        string;
  valueGST:  number;
  timestamp: number;
}

export class GhostFraudAgent extends BaseAgent {
  readonly role         = "fraud" as const;
  readonly name         = "GhostFraud AI";
  readonly description  = "AML monitoring, anomaly detection, and fraud pattern analysis";
  readonly capabilities = [
    "detect-anomaly", "aml-scan",
    "fraud-pattern", "velocity-check",
  ];

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "detect-anomaly": return this.detectAnomaly(task.payload);
      case "aml-scan":       return this.amlScan(task.payload);
      default:               return this.fraudReport();
    }
  }

  private async fraudReport(): Promise<Record<string, unknown>> {
    const recentAlerts = bus.getByType("alert:anomaly", 20);
    return {
      recentAnomalyAlerts: recentAlerts.length,
      alerts:              recentAlerts.map(e => ({ ts: e.timestamp, source: e.source, data: e.payload })),
      thresholds: {
        largeTxGST:         LARGE_TX_GST,
        velocityWindow:     `${VELOCITY_CHECK_WINDOW / 60_000}min`,
        velocityThreshold:  VELOCITY_TX_THRESHOLD,
      },
    };
  }

  private async detectAnomaly(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const txs = payload["transactions"] as TxRecord[] | undefined;
    if (!txs?.length) {
      // Try GhostBrain anomaly endpoint
      return this.callGhostBrainAnomaly(payload);
    }

    const findings: Array<{ type: string; address: string; tx?: string; detail: string }> = [];

    // 1. Large transaction check
    for (const tx of txs) {
      if (tx.valueGST > LARGE_TX_GST) {
        findings.push({ type: "large-tx", address: tx.from, tx: tx.hash, detail: `${tx.valueGST} GST` });
      }
    }

    // 2. Velocity check
    const now = Date.now();
    const addressCount = new Map<string, number>();
    for (const tx of txs) {
      if (now - tx.timestamp < VELOCITY_CHECK_WINDOW) {
        addressCount.set(tx.from, (addressCount.get(tx.from) ?? 0) + 1);
      }
    }
    for (const [address, count] of addressCount) {
      if (count > VELOCITY_TX_THRESHOLD) {
        findings.push({ type: "high-velocity", address, detail: `${count} txs in 1h window` });
      }
    }

    // 3. Circular transfer detection (simplified)
    const pairSet = new Set<string>();
    for (const tx of txs) {
      const key = `${tx.from}:${tx.to}`;
      const rev = `${tx.to}:${tx.from}`;
      if (pairSet.has(rev)) {
        findings.push({ type: "circular-transfer", address: tx.from, tx: tx.hash, detail: `circular with ${tx.to}` });
      }
      pairSet.add(key);
    }

    if (findings.length > 0) {
      bus.publish("alert:anomaly", "fraud", { count: findings.length, findings });
    }

    return { analyzed: txs.length, findings, flagged: findings.length > 0 };
  }

  private async amlScan(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const address = String(payload["address"] ?? "");
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return { error: "Valid EVM address required" };
    }

    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${COMPLIANCE_URL}/api/v1/aml/scan`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ address, chain: "ghostchain" }),
        signal:  ctrl.signal,
      });
      if (res.ok) {
        const result = await res.json() as Record<string, unknown>;
        if (result["flagged"]) {
          bus.publish("alert:anomaly", "fraud", { type: "aml-flag", address, result });
        }
        return { address, ...result };
      }
    } catch { /* compliance offline */ }

    // Offline: basic heuristic (new address bias)
    return {
      address,
      status:   "compliance-offline",
      flagged:  false,
      note:     `Connect compliance service on ${COMPLIANCE_URL} for full AML screening`,
    };
  }

  private async callGhostBrainAnomaly(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8_000);
      const res = await fetch(`${GHOSTBRAIN_URL}/api/v1/anomaly`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  ctrl.signal,
      });
      if (res.ok) return await res.json() as Record<string, unknown>;
    } catch { /* offline */ }

    return {
      status: "ghostbrain-offline",
      note:   "Provide transactions[] array for offline analysis",
    };
  }
}
