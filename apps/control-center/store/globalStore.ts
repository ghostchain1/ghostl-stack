"use client";
import { create } from "zustand";

// ── Domain types ──────────────────────────────────────────────────────────────

export interface ChainState {
  id:               string;
  name:             string;
  status:           "healthy" | "degraded" | "offline";
  blockHeight:      number;
  tps:              number;
  gasPrice:         string;
  activeValidators: number;
  totalStaked:      string;
  latency:          number;
}

export interface ValidatorState {
  address:        string;
  moniker:        string;
  votingPower:    number;
  commission:     number;
  uptimePct:      number;
  status:         "active" | "jailed" | "unbonding" | "inactive";
}

export interface NodeState {
  id:          string;
  name:        string;
  type:        "validator" | "rpc" | "archive" | "bootnode";
  chain:       string;
  status:      "online" | "syncing" | "offline";
  cpuPct:      number;
  memPct:      number;
  diskPct:     number;
  peers:       number;
  blockHeight: number;
}

export interface AIEngineState {
  id:        string;
  label:     string;
  port:      number;
  group:     string;
  status:    "online" | "offline" | "degraded";
  latencyMs: number;
  cycles:    number | null;
  lastCheck: number;
}

// ── Store interface ───────────────────────────────────────────────────────────

interface GlobalStore {
  chains:          ChainState[];
  setChains:       (v: ChainState[]) => void;

  validators:      ValidatorState[];
  setValidators:   (v: ValidatorState[]) => void;

  nodes:           NodeState[];
  setNodes:        (v: NodeState[]) => void;

  engines:         AIEngineState[];
  setEngines:      (v: AIEngineState[]) => void;

  role:            string;
  setRole:         (v: string) => void;

  emergencyStop:   boolean;
  setEmergencyStop:(v: boolean) => void;

  lastRefresh:     number;
  touchRefresh:    () => void;
}

// ── Zustand store ─────────────────────────────────────────────────────────────

export const useGlobalStore = create<GlobalStore>(set => ({
  chains:          [],
  setChains:       chains      => set({ chains }),

  validators:      [],
  setValidators:   validators  => set({ validators }),

  nodes:           [],
  setNodes:        nodes       => set({ nodes }),

  engines:         [],
  setEngines:      engines     => set({ engines }),

  role:            "viewer",
  setRole:         role        => set({ role }),

  emergencyStop:   false,
  setEmergencyStop:v           => set({ emergencyStop: v }),

  lastRefresh:     Date.now(),
  touchRefresh:    ()          => set({ lastRefresh: Date.now() }),
}));
