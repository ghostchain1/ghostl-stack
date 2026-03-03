// SPDX-License-Identifier: MIT
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║          GhostChain · GhostBrain AI Contract Engine Config              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, "../../../../ghostl-stack");

export const PORT          = Number(process.env.PORT ?? 7611);
export const SERVICE_NAME  = "ghost-ai-contract-engine";
export const VERSION       = "0.1.0";
export const NODE_ENV      = process.env.NODE_ENV ?? "development";

// Path configuration — all contract directories to scan
export const CONTRACTS_ROOT = resolve(ROOT, "contracts");
export const SRC_DIRS: string[] = [
  resolve(CONTRACTS_ROOT, "src"),
  resolve(CONTRACTS_ROOT, "test"),
  resolve(CONTRACTS_ROOT, "scripts"),
  resolve(CONTRACTS_ROOT, "compliance", "src"),
  resolve(CONTRACTS_ROOT, "compliance", "test"),
  resolve(CONTRACTS_ROOT, "compliance", "script"),
  resolve(CONTRACTS_ROOT, "formal"),
];

// Directories to SKIP (vendor / generated)
export const EXCLUDE_DIRS: string[] = [
  resolve(CONTRACTS_ROOT, "lib"),
  resolve(CONTRACTS_ROOT, "out-codex"),
  resolve(CONTRACTS_ROOT, "out-legacy"),
  resolve(CONTRACTS_ROOT, "cache-codex"),
  resolve(CONTRACTS_ROOT, "cache-legacy"),
  resolve(CONTRACTS_ROOT, "crytic-export"),
];

// Bridge contracts are excluded from branding (AGENTS.md policy)
export const BRIDGE_DIR = resolve(CONTRACTS_ROOT, "src", "bridge");

// GhostBrain brand header injected into all non-bridge .sol files (after SPDX)
export const BRAND_HEADER = `
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║          GhostChain · GhostBrain AI Contract Evolution System           ║
// ║  Self-learning · Self-evolving · Autonomous · GhostStack v2             ║
// ╚══════════════════════════════════════════════════════════════════════════╝
`;

// NATS
export const NATS_URL    = process.env.NATS_URL    ?? "nats://nats:4222";

// Forge binary path
export const FORGE_BIN   = process.env.FORGE_BIN   ?? "forge";

// Solc binary (for standalone scanning without full forge)
export const SOLC_BIN    = process.env.SOLC_BIN    ?? "solc";

// Low-memory compile: max files per batch before we flush the solc process
export const BATCH_SIZE  = Number(process.env.COMPILE_BATCH_SIZE ?? 30);

// Compile scan interval (ms) — how often the engine auto-runs
export const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS ?? 60_000);

// On-chain contract addresses (populated from env or devnet defaults)
export const GHOSTBRAIN_EVOLUTION_LEDGER  = process.env.GHOSTBRAIN_EVOLUTION_LEDGER  ?? "";
export const GHOSTBRAIN_ERROR_REGISTRY    = process.env.GHOSTBRAIN_ERROR_REGISTRY    ?? "";
export const GHOSTBRAIN_COMPILER_ORACLE   = process.env.GHOSTBRAIN_COMPILER_ORACLE   ?? "";
export const GHOSTBRAIN_CONTRACT_FACTORY  = process.env.GHOSTBRAIN_CONTRACT_FACTORY  ?? "";
