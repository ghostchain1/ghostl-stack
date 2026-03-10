/**
 * Network Controller
 *
 * Monitors network interface statistics from /proc/net/dev (Linux).
 * Falls back gracefully on non-Linux environments.
 *
 * Detects elevated error and drop rates on monitored interfaces, and
 * surfaces them to the MetricsCollector for routing to the DecisionEngine.
 */

import fs from "fs/promises";
import os from "os";
import type { IController } from "../brain/supervisor_core.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InterfaceStats {
  name:         string;
  rxBytes:      bigint;
  rxPackets:    bigint;
  rxErrors:     bigint;
  rxDrops:      bigint;
  txBytes:      bigint;
  txPackets:    bigint;
  txErrors:     bigint;
  txDrops:      bigint;
  sampledAt:    number;
}

export interface InterfaceDelta {
  name:          string;
  rxErrorRate:   number;  // errors per packet (0–1)
  rxDropRate:    number;
  txErrorRate:   number;
  txDropRate:    number;
  degraded:      boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ERROR_RATE_THRESHOLD = Number(process.env["NET_ERROR_RATE_THRESHOLD"] ?? "0.001"); // 0.1%

/** Interfaces explicitly monitored. If empty, all non-loopback interfaces are watched. */
const MONITORED_IFACES: ReadonlySet<string> = new Set(
  (process.env["NET_MONITORED_IFACES"] ?? "").split(",").map(s => s.trim()).filter(Boolean)
);

// ---------------------------------------------------------------------------
// NetworkController
// ---------------------------------------------------------------------------

export class NetworkController implements IController {
  readonly name = "NetworkController";

  private previous = new Map<string, InterfaceStats>();
  private latestDeltas: InterfaceDelta[] = [];

  async check(): Promise<void> {
    const current = await this.readStats();

    const deltas: InterfaceDelta[] = [];
    for (const [ifName, curr] of current) {
      const prev = this.previous.get(ifName);
      if (!prev) continue;

      const rxPkts = Number(curr.rxPackets - prev.rxPackets);
      const txPkts = Number(curr.txPackets - prev.txPackets);
      const rxErr  = Number(curr.rxErrors  - prev.rxErrors);
      const rxDrop = Number(curr.rxDrops   - prev.rxDrops);
      const txErr  = Number(curr.txErrors  - prev.txErrors);
      const txDrop = Number(curr.txDrops   - prev.txDrops);

      const rxErrorRate = rxPkts > 0 ? rxErr  / rxPkts : 0;
      const rxDropRate  = rxPkts > 0 ? rxDrop / rxPkts : 0;
      const txErrorRate = txPkts > 0 ? txErr  / txPkts : 0;
      const txDropRate  = txPkts > 0 ? txDrop / txPkts : 0;

      const degraded =
        rxErrorRate > ERROR_RATE_THRESHOLD ||
        rxDropRate  > ERROR_RATE_THRESHOLD ||
        txErrorRate > ERROR_RATE_THRESHOLD ||
        txDropRate  > ERROR_RATE_THRESHOLD;

      if (degraded) {
        console.warn(
          `[NetworkController] Interface "${ifName}" degraded — ` +
          `rxErr=${(rxErrorRate * 100).toFixed(3)}% rxDrop=${(rxDropRate * 100).toFixed(3)}%`
        );
      }

      deltas.push({ name: ifName, rxErrorRate, rxDropRate, txErrorRate, txDropRate, degraded });
    }

    this.latestDeltas = deltas;
    // Advance sliding window.
    this.previous = current;
  }

  getDegradedInterfaces(): string[] {
    return this.latestDeltas.filter(d => d.degraded).map(d => d.name);
  }

  getLatestDeltas(): InterfaceDelta[] {
    return [...this.latestDeltas];
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async readStats(): Promise<Map<string, InterfaceStats>> {
    const result = new Map<string, InterfaceStats>();

    try {
      const raw = await fs.readFile("/proc/net/dev", "utf8");
      for (const line of raw.split("\n").slice(2)) { // skip 2-line header
        const parts = line.trim().split(/\s+/);
        if (parts.length < 17) continue;

        const ifName = (parts[0] ?? "").replace(":", "");
        if (!this.shouldMonitor(ifName)) continue;

        result.set(ifName, {
          name:      ifName,
          rxBytes:   BigInt(parts[1]  ?? "0"),
          rxPackets: BigInt(parts[2]  ?? "0"),
          rxErrors:  BigInt(parts[3]  ?? "0"),
          rxDrops:   BigInt(parts[4]  ?? "0"),
          txBytes:   BigInt(parts[9]  ?? "0"),
          txPackets: BigInt(parts[10] ?? "0"),
          txErrors:  BigInt(parts[11] ?? "0"),
          txDrops:   BigInt(parts[12] ?? "0"),
          sampledAt: Date.now(),
        });
      }
    } catch {
      // /proc/net/dev not available (macOS/Windows) — use os.networkInterfaces() as stub.
      for (const [ifName] of Object.entries(os.networkInterfaces())) {
        if (!this.shouldMonitor(ifName)) continue;
        result.set(ifName, {
          name: ifName, rxBytes: 0n, rxPackets: 0n, rxErrors: 0n, rxDrops: 0n,
          txBytes: 0n, txPackets: 0n, txErrors: 0n, txDrops: 0n, sampledAt: Date.now(),
        });
      }
    }

    return result;
  }

  private shouldMonitor(ifName: string): boolean {
    if (ifName === "lo" || ifName === "localhost") return false;
    if (MONITORED_IFACES.size > 0) return MONITORED_IFACES.has(ifName);
    return true;
  }
}
