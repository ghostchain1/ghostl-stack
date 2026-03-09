/**
 * governance-event-bridge — Main Polling Loop
 *
 * Polls GhostChainGovernor events on L1 and L2 using eth_getLogs,
 * decodes them, and forwards each event as a BrainMessage signal to
 * ghostbrain-core via HMAC-authenticated HTTP POST.
 *
 * Architecture:
 *   GhostChainGovernor (L1/L2)
 *       ↓  eth_getLogs
 *   governance-event-bridge
 *       ↓  POST /api/v1/signals  (HMAC auth)
 *   ghostbrain-core
 *       ↓  evaluatePlan / AI routing
 *   hyper-ghost-ai / treasury-ai
 */

import { loadConfig }                        from "./config.js";
import { TOPICS, parseLog, type RawLog }     from "./events.js";
import { getLatestBlock, getLogs }           from "./rpc.js";
import { loadState, saveState }              from "./state.js";
import { BrainPoster }                       from "./brain.js";
import { CosmosGovPoller }                   from "./cosmos-poller.js";

// ── Logging ───────────────────────────────────────────────────────────────────

const cfg = loadConfig();

type LogLevel = "debug" | "info" | "warn" | "error";
const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel = LEVELS[cfg.LOG_LEVEL];

function log(level: LogLevel, msg: string): void {
  if (LEVELS[level] >= minLevel) {
    const ts = new Date().toISOString();
    process.stderr.write(`${ts} [${level.toUpperCase()}] governance-event-bridge | ${msg}\n`);
  }
}

// ── Network descriptor ────────────────────────────────────────────────────────

interface NetworkTarget {
  layer:    "L1" | "L2";
  rpcUrl:   string;
  address:  string;
  chainId:  number;
}

// ── Topic0 array — same set for all networks ───────────────────────────────────

const ALL_TOPIC0S = Object.values(TOPICS);

// ── Per-network poll ──────────────────────────────────────────────────────────

async function pollNetwork(
  net:     NetworkTarget,
  poster:  BrainPoster,
  fromBlock: bigint,
  toBlock:   bigint,
): Promise<bigint> {
  log("debug", `[${net.layer}] getLogs from=${fromBlock} to=${toBlock}`);

  let rawLogs: RawLog[];
  try {
    rawLogs = await getLogs(net.rpcUrl, net.address, ALL_TOPIC0S, fromBlock, toBlock);
  } catch (err) {
    log("warn", `[${net.layer}] getLogs failed: ${String(err)}`);
    return fromBlock - 1n; // retry same range next cycle
  }

  const events = rawLogs.map((l) => parseLog(l)).filter((e) => e !== null);

  if (events.length === 0) {
    log("debug", `[${net.layer}] no governance events in range`);
    return toBlock;
  }

  log("info", `[${net.layer}] ${events.length} event(s) in blocks [${fromBlock}..${toBlock}]`);

  const { sent, failed } = await poster.postAll(
    events,
    net.layer,
    net.chainId,
    (msg) => log("warn", msg),
  );

  if (sent > 0) {
    log("info", `[${net.layer}] posted ${sent} signal(s) to ghostbrain-core`);
  }
  if (failed > 0) {
    log("warn", `[${net.layer}] failed to post ${failed} signal(s)`);
  }

  return toBlock;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("info", "starting governance-event-bridge");
  log("info", `ghostbrain-core URL: ${cfg.GHOSTBRAIN_URL}`);
  log("info", `L1 RPC: ${cfg.RPC_L1}  governor: ${cfg.GOVERNOR_ADDRESS_L1 || "(not configured)"}`);
  log("info", `L2 RPC: ${cfg.RPC_L2}  governor: ${cfg.GOVERNOR_ADDRESS_L2 || "(not configured)"}`);

  // Build list of active network targets (skip unconfigured ones)
  const networks: NetworkTarget[] = [];

  if (cfg.GOVERNOR_ADDRESS_L1) {
    // Fetch chainId to include in signals for downstream consumers
    let l1ChainId = 14000101; // default
    try {
      const hex = await (await fetch(cfg.RPC_L1, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      })).json() as { result?: string };
      if (hex.result) l1ChainId = Number(BigInt(hex.result));
    } catch { /* use default */ }

    networks.push({ layer: "L1", rpcUrl: cfg.RPC_L1, address: cfg.GOVERNOR_ADDRESS_L1, chainId: l1ChainId });
  }

  if (cfg.GOVERNOR_ADDRESS_L2) {
    let l2ChainId = 901;
    try {
      const hex = await (await fetch(cfg.RPC_L2, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      })).json() as { result?: string };
      if (hex.result) l2ChainId = Number(BigInt(hex.result));
    } catch { /* use default */ }

    networks.push({ layer: "L2", rpcUrl: cfg.RPC_L2, address: cfg.GOVERNOR_ADDRESS_L2, chainId: l2ChainId });
  }

  if (networks.length === 0 && !cfg.COSMOS_LCD_URL) {
    log("warn", "no governor addresses or COSMOS_LCD_URL configured — service is idle. Set GOVERNOR_ADDRESS_L1, GOVERNOR_ADDRESS_L2, and/or COSMOS_LCD_URL.");
  }

  const poster = new BrainPoster({
    ghostbrainUrl: cfg.GHOSTBRAIN_URL,
    hmacSecret:    cfg.CONTROL_PLANE_HMAC_SECRET,
  });

  // Optional Cosmos SDK governance poller (diff-based, no block range needed)
  let cosmosPoller: CosmosGovPoller | null = null;
  if (cfg.COSMOS_LCD_URL) {
    log("info", `Cosmos LCD: ${cfg.COSMOS_LCD_URL}  chain: ${cfg.COSMOS_CHAIN_ID}`);
    cosmosPoller = new CosmosGovPoller({
      lcdUrl:  cfg.COSMOS_LCD_URL,
      chainId: cfg.COSMOS_CHAIN_ID,
      poster,
      log,
    });
  }

  // Load persisted state (last processed block per layer)
  const state = loadState(cfg.STATE_FILE, cfg.START_BLOCK_L1, cfg.START_BLOCK_L2);
  log("info", `state loaded: L1=${state.L1} L2=${state.L2}`);

  const lastBlock: Record<"L1" | "L2", bigint> = {
    L1: BigInt(state.L1),
    L2: BigInt(state.L2),
  };

  // ── Polling loop ────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cycleStart = Date.now();
    let stateChanged = false;

    for (const net of networks) {
      let latestBlock: bigint;
      try {
        latestBlock = await getLatestBlock(net.rpcUrl);
      } catch (err) {
        log("warn", `[${net.layer}] eth_blockNumber failed: ${String(err)}`);
        continue;
      }

      const from = lastBlock[net.layer] + 1n;
      if (from > latestBlock) {
        log("debug", `[${net.layer}] up to date at block ${latestBlock}`);
        continue;
      }

      // Cap the range to avoid oversized getLogs requests
      const rangeLimit = BigInt(cfg.LOG_BLOCK_RANGE);
      const to = from + rangeLimit - 1n < latestBlock ? from + rangeLimit - 1n : latestBlock;

      const processed = await pollNetwork(net, poster, from, to);
      if (processed >= from) {
        lastBlock[net.layer] = processed;
        stateChanged = true;
      }
    }

    // Persist state only when something changed
    if (stateChanged) {
      try {
        saveState(cfg.STATE_FILE, { L1: Number(lastBlock.L1), L2: Number(lastBlock.L2) });
      } catch (err) {
        log("warn", `failed to save state: ${String(err)}`);
      }
    }

    // Cosmos governance poll (diff-based, no block tracking needed)
    if (cosmosPoller) {
      await cosmosPoller.poll();
    }

    // Sleep until next poll, accounting for time spent
    const elapsed = Date.now() - cycleStart;
    const sleep = Math.max(0, cfg.POLL_INTERVAL_MS - elapsed);
    await new Promise<void>((resolve) => setTimeout(resolve, sleep));
  }
}

main().catch((err) => {
  process.stderr.write(`[FATAL] governance-event-bridge: ${String(err)}\n`);
  process.exit(1);
});
