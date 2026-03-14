/**
 * governance-event-bridge — State persistence
 *
 * Persists the last successfully processed block number per chain layer
 * to a JSON file on disk, allowing the bridge to resume without re-processing
 * already-delivered events after a restart.
 *
 * File format (example):
 *   { "L1": 12345, "L2": 67890, "updatedAt": "2026-03-06T12:00:00.000Z" }
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export type LayerKey = "L1" | "L2";

export interface BridgeState {
  L1: number;
  L2: number;
  updatedAt: string;
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadState(filePath: string, defaultL1: number, defaultL2: number): BridgeState {
  try {
    if (!existsSync(filePath)) {
      return { L1: defaultL1, L2: defaultL2, updatedAt: new Date().toISOString() };
    }
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<BridgeState>;
    return {
      L1: typeof parsed.L1 === "number" && parsed.L1 >= 0 ? parsed.L1 : defaultL1,
      L2: typeof parsed.L2 === "number" && parsed.L2 >= 0 ? parsed.L2 : defaultL2,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { L1: defaultL1, L2: defaultL2, updatedAt: new Date().toISOString() };
  }
}

export function saveState(filePath: string, state: Omit<BridgeState, "updatedAt">): void {
  ensureDir(filePath);
  const full: BridgeState = { ...state, updatedAt: new Date().toISOString() };
  writeFileSync(filePath, JSON.stringify(full, null, 2), "utf8");
}
