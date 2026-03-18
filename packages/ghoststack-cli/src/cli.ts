#!/usr/bin/env node
/**
 * ghoststack — sovereign GhostChain development CLI
 *
 * Commands:
 *   ghoststack genesis             Bootstrap the full GhostStack ecosystem
 *   ghoststack status              Show L1/L2/L3 chain status
 *   ghoststack deploy <contract>   Deploy a contract via ghost-deployer
 *   ghoststack scan                Run an ecosystem feature scan via ghost-evolution
 *   ghoststack propose             Generate an upgrade proposal from scan gaps
 *   ghoststack agents              Show GhostBrain swarm agent health
 *
 * Environment variables (all optional — defaults to localhost devnet):
 *   GHOST_L1_RPC           L1 RPC endpoint   (default: http://127.0.0.1:18545)
 *   GHOST_L2_RPC           L2 RPC endpoint   (default: http://127.0.0.1:29547)
 *   GHOST_L3_RPC           L3 RPC endpoint   (default: http://127.0.0.1:39545)
 *   DEPLOYER_URL           ghost-deployer    (default: http://127.0.0.1:7961)
 *   EVOLUTION_URL          ghost-evolution   (default: http://127.0.0.1:7962)
 *   SWARM_URL              ghostbrain-swarm  (default: http://127.0.0.1:7960)
 *   GHOSTBRAIN_URL         ghostbrain-core   (default: http://127.0.0.1:7900)
 */

import { fetch } from "undici";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const _filename = fileURLToPath(import.meta.url);
const _dirname  = dirname(_filename);

const GHOST_L1_RPC   = process.env.GHOST_L1_RPC   ?? "http://127.0.0.1:18545";
const GHOST_L2_RPC   = process.env.GHOST_L2_RPC   ?? "http://127.0.0.1:29547";
const GHOST_L3_RPC   = process.env.GHOST_L3_RPC   ?? "http://127.0.0.1:39545";
const DEPLOYER_URL   = process.env.DEPLOYER_URL    ?? "http://127.0.0.1:7961";
const EVOLUTION_URL  = process.env.EVOLUTION_URL   ?? "http://127.0.0.1:7962";
const SWARM_URL      = process.env.SWARM_URL       ?? "http://127.0.0.1:7960";
const GHOSTBRAIN_URL = process.env.GHOSTBRAIN_URL  ?? "http://127.0.0.1:7900";

// ── Utilities ─────────────────────────────────────────────────────────────────

const OK    = "\x1b[32m✓\x1b[0m";
const FAIL  = "\x1b[31m✗\x1b[0m";
const INFO  = "\x1b[36mℹ\x1b[0m";
const GHOST = "\x1b[35m👻\x1b[0m";

function log(...args: unknown[]): void {
  console.log(...args);
}

function err(...args: unknown[]): void {
  console.error(...args);
}

async function rpcBlockNumber(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4_000);
    const res = await fetch(url, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal:  ctrl.signal,
    });
    const body = await res.json() as { result?: string };
    const block = body.result ? parseInt(body.result, 16) : null;
    return block !== null ? `block ${block}` : "no block";
  } catch {
    return "offline";
  }
}

async function httpGet(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 5_000);
  const res = await fetch(url, { signal: ctrl.signal });
  return res.json();
}

async function httpPost(url: string, body: unknown): Promise<unknown> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 30_000);
  const res = await fetch(url, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify(body),
    signal:  ctrl.signal,
  });
  return res.json();
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdStatus(): Promise<void> {
  log(`\n${GHOST} GhostStack Chain Status\n`);

  const [l1, l2, l3] = await Promise.all([
    rpcBlockNumber(GHOST_L1_RPC),
    rpcBlockNumber(GHOST_L2_RPC),
    rpcBlockNumber(GHOST_L3_RPC),
  ]);

  const chains = [
    { name: "GhostChain L1", chainId: 14000101, rpc: GHOST_L1_RPC, status: l1 },
    { name: "GhostL2",       chainId: 901,       rpc: GHOST_L2_RPC, status: l2 },
    { name: "GhostL3",       chainId: 903,       rpc: GHOST_L3_RPC, status: l3 },
  ];

  for (const c of chains) {
    const icon = c.status === "offline" ? FAIL : OK;
    log(`  ${icon} ${c.name.padEnd(18)} chainId=${c.chainId}  ${c.rpc}  ${c.status}`);
  }

  // Service health
  log(`\n${INFO} Service health:\n`);
  const services = [
    { name: "GhostBrain Core  ", url: GHOSTBRAIN_URL },
    { name: "GhostBrain Swarm ", url: SWARM_URL      },
    { name: "Ghost Deployer   ", url: DEPLOYER_URL   },
    { name: "Ghost Evolution  ", url: EVOLUTION_URL  },
  ];

  await Promise.all(services.map(async s => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 3_000);
      const res = await fetch(`${s.url}/health`, { signal: ctrl.signal });
      const icon = res.ok ? OK : FAIL;
      log(`  ${icon} ${s.name} ${s.url}`);
    } catch {
      log(`  ${FAIL} ${s.name} ${s.url}  (unreachable)`);
    }
  }));

  log("");
}

async function cmdGenesis(args: string[]): Promise<void> {
  log(`\n${GHOST} GhostStack Genesis — bootstrapping sovereign ecosystem ...\n`);

  const dryRun      = args.includes("--dry-run");
  const skipBoot    = args.includes("--skip-bootstrap");
  const useInspect  = args.includes("--status-only");

  // ── status-only mode: legacy scan behaviour ───────────────────────────────
  if (useInspect) {
    await cmdStatus();
    return;
  }

  // ── Locate the v4 genesis installer ──────────────────────────────────────
  // Resolves relative to: packages/ghoststack-cli/src/cli.ts  →  ../../..  (stack root)
  const stackRoot    = resolve(_dirname, "..", "..", "..");
  const installerPath = resolve(stackRoot, "infra", "genesis", "ghoststack-genesis.sh");

  if (!existsSync(installerPath)) {
    err(`${FAIL} Genesis installer not found at ${installerPath}`);
    err(`       Ensure infra/genesis/ghoststack-genesis.sh is present in the stack root.`);
    process.exit(1);
  }

  log(`${INFO} Invoking genesis installer:\n       ${installerPath}\n`);

  // Build env from current process + CLI flags
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Propagate chain RPC overrides from CLI env
    L1_RPC:          process.env["GHOST_L1_RPC"] ?? process.env["L1_RPC"] ?? "http://localhost:18545",
    L2_RPC:          process.env["GHOST_L2_RPC"] ?? process.env["L2_RPC"] ?? "http://localhost:29547",
    L3_RPC:          process.env["GHOST_L3_RPC"] ?? process.env["L3_RPC"] ?? "http://localhost:39545",
    GHOSTBRAIN_URL:  GHOSTBRAIN_URL,
    AI_SWARM_URL:    SWARM_URL,
    DEPLOYER_URL:    DEPLOYER_URL,
    EVOLUTION_URL:   EVOLUTION_URL,
    ...(dryRun   ? { DRY_RUN: "true" }           : {}),
    ...(skipBoot ? { SKIP_BOOTSTRAP: "true" }    : {}),
  };

  const result = spawnSync("bash", [installerPath], {
    stdio:  "inherit",
    env,
  });

  if (result.error) {
    err(`${FAIL} Failed to launch genesis installer: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    err(`\n${FAIL} Genesis installer exited with code ${result.status ?? "unknown"}.`);
    err(`       Check logs in ${stackRoot}/logs/ for details.`);
    process.exit(result.status ?? 1);
  }

  log(`\n${OK} GhostStack genesis complete.`);
}

async function cmdDeploy(args: string[]): Promise<void> {
  const contractName = args[0];
  if (!contractName) {
    err(`${FAIL} Usage: ghoststack deploy <ContractName> [--layer L3] [--bridge] [--settle]`);
    process.exit(1);
  }

  const layer     = (args.includes("--layer") ? args[args.indexOf("--layer") + 1] : "L3") as "L1" | "L2" | "L3";
  const bridgeToL2 = args.includes("--bridge");
  const settleToL1 = args.includes("--settle");

  log(`\n${GHOST} Deploying ${contractName} to ${layer} ...\n`);

  try {
    const d = await httpPost(`${DEPLOYER_URL}/deploy`, {
      contractName,
      targetLayer:  layer,
      bridgeToL2,
      settleToL1,
    }) as { id?: string; stage?: string };

    log(`  ${OK} Deployment queued: ${d.id}`);
    log(`  ${INFO} Stage: ${d.stage}`);
    log(`\n  ${INFO} Poll status: ghoststack status --deployment ${d.id}`);
    log(`  ${INFO} Or: GET ${DEPLOYER_URL}/deploy/${d.id}\n`);
  } catch {
    err(`  ${FAIL} ghost-deployer unreachable at ${DEPLOYER_URL}`);
    process.exit(1);
  }
}

async function cmdScan(): Promise<void> {
  log(`\n${GHOST} Ecosystem Feature Scan\n`);
  try {
    const scan = await httpPost(`${EVOLUTION_URL}/scan`, {}) as {
      coveragePct?: number; missing?: number; present?: number; totalFeatures?: number;
      features?: Array<{ id: string; name: string; category: string; present: boolean; note?: string }>;
    };
    log(`  ${OK} Coverage: ${scan.coveragePct}%  (${scan.present}/${scan.totalFeatures} features present)\n`);
    if (scan.features) {
      const missing = scan.features.filter(f => !f.present);
      if (missing.length > 0) {
        log(`  Missing features:\n`);
        for (const f of missing) {
          log(`    ${FAIL} [${f.category}] ${f.name.padEnd(30)} ${f.note ?? ""}`);
        }
      }
    }
    log("");
  } catch {
    err(`  ${FAIL} ghost-evolution unreachable at ${EVOLUTION_URL}`);
    process.exit(1);
  }
}

async function cmdPropose(args: string[]): Promise<void> {
  const submitIdx = args.indexOf("--submit");
  if (submitIdx >= 0) {
    // Submit an existing proposal for ratification
    const proposalId = args[submitIdx + 1];
    if (!proposalId) { err(`${FAIL} Usage: ghoststack propose --submit <proposalId>`); process.exit(1); }
    try {
      const r = await httpPost(`${EVOLUTION_URL}/proposals/${proposalId}/submit`, {}) as { status?: string; message?: string };
      log(`\n  ${OK} ${r.message}\n`);
    } catch {
      err(`  ${FAIL} Failed to submit proposal.`);
    }
    return;
  }

  // Generate new proposal
  log(`\n${GHOST} Generating upgrade proposal ...\n`);
  try {
    const p = await httpPost(`${EVOLUTION_URL}/proposal`, {}) as {
      id?: string; title?: string; description?: string; actions?: unknown[];
    };
    log(`  ${OK} Proposal: ${p.id}`);
    log(`     ${p.title}`);
    log(`\n${p.description ?? ""}\n`);
    log(`  ${INFO} Submit: ghoststack propose --submit ${p.id}\n`);
  } catch {
    err(`  ${FAIL} ghost-evolution unreachable.`);
    process.exit(1);
  }
}

async function cmdAgents(): Promise<void> {
  log(`\n${GHOST} GhostBrain Swarm Agents\n`);
  try {
    const data = await httpGet(`${SWARM_URL}/agents`) as {
      agents?: Array<{ id: string; role: string; status: string; latency: number; taskCount: number }>
    };
    for (const a of data.agents ?? []) {
      const icon    = a.status === "online" ? OK : a.status === "degraded" ? INFO : FAIL;
      const latency = a.latency >= 0 ? `${a.latency}ms` : "n/a";
      log(`  ${icon} ${a.role.padEnd(14)} ${a.status.padEnd(10)} latency=${latency}  tasks=${a.taskCount}`);
    }
    log("");
  } catch {
    err(`  ${FAIL} ghostbrain-swarm unreachable at ${SWARM_URL}`);
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
  log(`
${GHOST} ghoststack — GhostChain Sovereign Development CLI

Usage:
  ghoststack <command> [options]

Commands:
  genesis                    Bootstrap the full GhostStack ecosystem
    --dry-run                Print all actions, execute nothing
    --skip-bootstrap         Skip phases 1-18 (v3); run only v4 phases 19-24
    --status-only            Legacy: show chain/service status only
  status                     Show L1/L2/L3 chain + service status
  deploy <Contract> [opts]   Deploy a contract via ghost-deployer
    --layer  L1|L2|L3        Target layer        (default: L3)
    --bridge                 Bridge L3→L2 after deploy
    --settle                 Settle L2→L1 after bridge
  scan                       Run an ecosystem feature scan
  propose                    Generate an upgrade proposal from scan gaps
    --submit <id>            Submit a draft proposal for governance ratification
  agents                     Show GhostBrain swarm agent health

Environment variables:
  GHOST_L1_RPC   GHOST_L2_RPC   GHOST_L3_RPC   (chain RPCs)
  DEPLOYER_URL   EVOLUTION_URL  SWARM_URL       GHOSTBRAIN_URL
`);
}

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case "genesis":  await cmdGenesis(args);    break;
  case "status":   await cmdStatus();        break;
  case "deploy":   await cmdDeploy(args);    break;
  case "scan":     await cmdScan();          break;
  case "propose":  await cmdPropose(args);   break;
  case "agents":   await cmdAgents();        break;
  case "help":
  case "--help":
  case "-h":
  default:
    printHelp();
}
