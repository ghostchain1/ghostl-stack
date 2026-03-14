/**
 * Chain Launcher — autonomously provisions new blockchains or rollups on GhostStack.
 */

import { v4 as uuid } from "uuid";
import logger          from "../utils/logger";

export type ChainType   = "l1" | "l2-optimistic" | "l2-zk" | "l3-app" | "sidechain" | "sovereign-rollup";
export type ChainStatus = "planning" | "provisioning" | "deploying" | "syncing" | "live" | "deprecated";

export interface LaunchedChain {
  id:             string;
  name:           string;
  chainId:        number;
  type:           ChainType;
  purpose:        string;
  parentChain:    string;
  status:         ChainStatus;
  validators:     number;
  tps:            number;
  blockTime:      number;    // seconds
  nativeCurrency: string;
  rpcEndpoint:    string;
  explorerUrl:    string;
  launchedAt:     number;
  createdAt:      number;
  tvl:            number;    // USD
  users:          number;
}

const MAX_CHAINS = 100;
const store: LaunchedChain[] = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }

const CHAIN_TEMPLATES: { name: string; type: ChainType; purpose: string; currency: string }[] = [
  { name: "Ghost Gaming Chain",    type: "l3-app",           purpose: "Real-time gaming assets and NFT trading",         currency: "GGC"  },
  { name: "Ghost AI Chain",        type: "l2-zk",            purpose: "AI model inference and training rewards",          currency: "GAI"  },
  { name: "Ghost DeFi Chain",      type: "l2-optimistic",    purpose: "High-frequency DEX and lending protocol hub",      currency: "GDF"  },
  { name: "Ghost Privacy Chain",   type: "l2-zk",            purpose: "ZK-shielded transactions and private contracts",   currency: "GPR"  },
  { name: "Ghost Social Chain",    type: "l3-app",           purpose: "Decentralized social media and identity",          currency: "GSC"  },
  { name: "Ghost Data Chain",      type: "sovereign-rollup", purpose: "AI data marketplace and model registry",           currency: "GDT"  },
  { name: "Ghost Identity Chain",  type: "l2-zk",            purpose: "Self-sovereign identity and credentials",          currency: "GID"  },
  { name: "Ghost IoT Chain",       type: "sidechain",        purpose: "IoT device telemetry and micropayments",           currency: "GIT"  },
];

const PARENT_CHAINS = ["GhostChain", "GhostL2", "GhostL3"];

function makeChain(tmpl: typeof CHAIN_TEMPLATES[0], hoursAgo: number): LaunchedChain {
  const live = Math.random() > 0.25;
  const chainId = rand(70000, 99999);
  const host    = `${tmpl.name.toLowerCase().replace(/\s+/g, "-")}.ghost.network`;
  return {
    id:             uuid(),
    name:           tmpl.name,
    chainId,
    type:           tmpl.type,
    purpose:        tmpl.purpose,
    parentChain:    pick(PARENT_CHAINS),
    status:         live ? "live" : pick(["planning", "provisioning", "deploying", "syncing"] as ChainStatus[]),
    validators:     rand(7, 100),
    tps:            rand(100, 10000),
    blockTime:      rand(1, 6),
    nativeCurrency: tmpl.currency,
    rpcEndpoint:    `https://rpc.${host}`,
    explorerUrl:    `https://explorer.${host}`,
    launchedAt:     live ? Date.now() - rand(1, hoursAgo) * 3_600_000 : 0,
    createdAt:      Date.now() - hoursAgo * 3_600_000,
    tvl:            live ? rand(50_000, 50_000_000) : 0,
    users:          live ? rand(100, 50_000) : 0,
  };
}

function seed() {
  CHAIN_TEMPLATES.slice(0, 5).forEach((tmpl, i) => {
    store.push(makeChain(tmpl, rand(24, 2160)));
  });
  logger.info(`[ChainLauncher] Seeded ${store.length} chains`);
}

export function launchChain(name?: string, type?: ChainType, parentChain?: string): LaunchedChain {
  const tmpl   = CHAIN_TEMPLATES.find(t => t.name === name) ?? pick(CHAIN_TEMPLATES);
  const chainId = rand(70000, 99999);
  const host    = `${tmpl.name.toLowerCase().replace(/\s+/g, "-")}.ghost.network`;
  const chain: LaunchedChain = {
    id:             uuid(),
    name:           tmpl.name,
    chainId,
    type:           type ?? tmpl.type,
    purpose:        tmpl.purpose,
    parentChain:    parentChain ?? pick(PARENT_CHAINS),
    status:         "provisioning",
    validators:     rand(7, 50),
    tps:            rand(100, 8000),
    blockTime:      rand(1, 6),
    nativeCurrency: tmpl.currency,
    rpcEndpoint:    `https://rpc.${host}`,
    explorerUrl:    `https://explorer.${host}`,
    launchedAt:     0,
    createdAt:      Date.now(),
    tvl:            0,
    users:          0,
  };
  store.unshift(chain);
  if (store.length > MAX_CHAINS) store.pop();
  logger.info(`[ChainLauncher] Launching ${chain.name} (chainId ${chainId}) on ${chain.parentChain}`);
  // Simulate async progression
  setTimeout(() => {
    chain.status    = "live";
    chain.launchedAt = Date.now();
    chain.tvl       = rand(10_000, 1_000_000);
    logger.info(`[ChainLauncher] ${chain.name} is LIVE`);
  }, rand(2000, 8000));
  return chain;
}

export function getChains(opts: { type?: ChainType; status?: ChainStatus; limit?: number } = {}): LaunchedChain[] {
  let chains = [...store];
  if (opts.type)   chains = chains.filter(c => c.type   === opts.type);
  if (opts.status) chains = chains.filter(c => c.status === opts.status);
  return chains.slice(0, opts.limit ?? 50);
}

export function getChainById(id: string): LaunchedChain | undefined {
  return store.find(c => c.id === id);
}

export function getChainStats() {
  return {
    total:      store.length,
    live:       store.filter(c => c.status === "live").length,
    deploying:  store.filter(c => ["provisioning","deploying","syncing"].includes(c.status)).length,
    totalTVL:   store.reduce((s, c) => s + c.tvl, 0),
    totalUsers: store.reduce((s, c) => s + c.users, 0),
    byType:     Object.fromEntries((["l1","l2-optimistic","l2-zk","l3-app","sidechain","sovereign-rollup"] as ChainType[]).map(t => [t, store.filter(c => c.type === t).length])),
  };
}

seed();
