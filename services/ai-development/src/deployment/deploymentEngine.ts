/**
 * Deployment Engine — deploys contracts and services to GhostChain, GhostL2, GhostL3
 */

import { v4 as uuid }               from "uuid";
import { getContractById, updateContractDeployment } from "../contracts/contractBuilder";
import logger                        from "../utils/logger";

export type DeploymentStatus = "queued" | "deploying" | "deployed" | "failed" | "rolled-back";
export type DeploymentType   = "contract" | "service" | "upgrade" | "migration";
export type NetworkName      = "GhostChain" | "GhostL2" | "GhostL3";

export interface DeploymentStage {
  name:   string;
  status: "pending" | "running" | "done" | "failed";
  ms?:    number;
}

export interface Deployment {
  id:          string;
  name:        string;
  type:        DeploymentType;
  network:     NetworkName;
  version:     string;
  status:      DeploymentStatus;
  txHash?:     string;
  address?:    string;
  gasUsed?:    number;
  blockNumber?: number;
  stages:      DeploymentStage[];
  deployedAt:  number;
  deployedBy:  string;
  duration_ms?: number;
}

const MAX_DEPS = 300;
const store: Deployment[] = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function hex(len = 64): string { return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join(""); }
function addr(): string { return "0x" + hex(40); }
function txHash(): string { return "0x" + hex(64); }

const NETWORKS: NetworkName[] = ["GhostChain", "GhostL2", "GhostL3"];
const SERVICES = ["ai-marketing","ai-growth","ai-adoption","ai-expansion","ai-economy","ai-infrastructure","ai-security","ai-intelligence","ai-governance","ai-interchain","ai-agents","ai-development"];
const CONTRACT_STAGES: DeploymentStage[] = [
  { name: "compile",  status: "pending" },
  { name: "optimize", status: "pending" },
  { name: "broadcast",status: "pending" },
  { name: "verify",   status: "pending" },
];
const SERVICE_STAGES: DeploymentStage[] = [
  { name: "build-image", status: "pending" },
  { name: "push-image",  status: "pending" },
  { name: "stop-old",    status: "pending" },
  { name: "start-new",   status: "pending" },
  { name: "healthcheck", status: "pending" },
];

function makeStages(type: DeploymentType, success: boolean): DeploymentStage[] {
  const template = type === "contract" || type === "upgrade" ? CONTRACT_STAGES : SERVICE_STAGES;
  const stages: DeploymentStage[] = template.map(s => ({ ...s }));
  let failed = false;
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    if (!success && !failed && i === stages.length - 1) {
      stage.status = "failed";
      stage.ms     = rand(200, 2000);
      failed = true;
    } else if (failed) {
      stage.status = "pending";
    } else {
      stage.status = "done";
      stage.ms     = rand(100, 4000);
    }
  }
  return stages;
}

function seed() {
  const now   = Date.now();
  const names = [
    ...["GhostStaking","GhostToken","GhostDAO","GhostBridge","GhostSwapPool","GhostMarket"],
    ...SERVICES.slice(0, 6),
  ];
  for (let i = 0; i < 14; i++) {
    const isContract = i < 7;
    const success    = Math.random() > 0.15;
    const type: DeploymentType = isContract ? (Math.random() > 0.7 ? "upgrade" : "contract") : "service";
    const name       = isContract ? pick(names.slice(0, 6)) : pick(names.slice(6));
    const network    = pick(NETWORKS);
    const hoursAgo   = rand(1, 240);
    const dur        = rand(8000, 90000);
    store.push({
      id:          uuid(),
      name,
      type,
      network,
      version:     `v${rand(1, 3)}.${rand(0, 9)}.${rand(0, 9)}`,
      status:      success ? "deployed" : (Math.random() > 0.5 ? "failed" : "rolled-back"),
      ...(success && isContract ? { txHash: txHash(), address: addr(), gasUsed: rand(200_000, 3_500_000), blockNumber: rand(1_000_000, 9_000_000) } : {}),
      stages:      makeStages(type, success),
      deployedAt:  now - hoursAgo * 3_600_000,
      deployedBy:  "ADE/autonomous",
      duration_ms: dur,
    });
  }
  logger.info(`[DeploymentEngine] Seeded ${store.length} deployments`);
}

export function deployContract(contractId: string, network?: NetworkName): Deployment {
  const contract = getContractById(contractId);
  const net      = network ?? (contract ? contract.network as NetworkName : pick(NETWORKS));
  const name     = contract?.name ?? "UnknownContract";
  const success  = Math.random() > 0.12;
  const dep: Deployment = {
    id:          uuid(),
    name,
    type:        "contract",
    network:     net,
    version:     `v1.${rand(0, 9)}.${rand(0, 9)}`,
    status:      success ? "deployed" : "failed",
    ...(success ? { txHash: txHash(), address: addr(), gasUsed: rand(200_000, 3_500_000), blockNumber: rand(1_000_000, 9_000_000) } : {}),
    stages:      makeStages("contract", success),
    deployedAt:  Date.now(),
    deployedBy:  "ADE/autonomous",
    duration_ms: rand(8000, 90000),
  };
  if (success && dep.address) {
    updateContractDeployment(contractId, dep.address);
    logger.info(`[DeploymentEngine] Contract ${name} deployed to ${net} @ ${dep.address}`);
  } else {
    logger.warn(`[DeploymentEngine] Contract ${name} deployment FAILED on ${net}`);
  }
  store.unshift(dep);
  if (store.length > MAX_DEPS) store.pop();
  return dep;
}

export function deployService(serviceName: string): Deployment {
  const success = Math.random() > 0.08;
  const dep: Deployment = {
    id:          uuid(),
    name:        serviceName,
    type:        "service",
    network:     "GhostChain",
    version:     `v${rand(1, 5)}.${rand(0, 9)}.${rand(0, 9)}`,
    status:      success ? "deployed" : "failed",
    stages:      makeStages("service", success),
    deployedAt:  Date.now(),
    deployedBy:  "ADE/autonomous",
    duration_ms: rand(5000, 45000),
  };
  logger.info(`[DeploymentEngine] Service ${serviceName} ${success ? "deployed" : "FAILED"}`);
  store.unshift(dep);
  if (store.length > MAX_DEPS) store.pop();
  return dep;
}

export function getDeployments(opts: {
  network?: NetworkName; type?: DeploymentType; status?: DeploymentStatus; limit?: number;
} = {}): Deployment[] {
  let deps = [...store];
  if (opts.network) deps = deps.filter(d => d.network === opts.network);
  if (opts.type)    deps = deps.filter(d => d.type   === opts.type);
  if (opts.status)  deps = deps.filter(d => d.status === opts.status);
  return deps.slice(0, opts.limit ?? 50);
}

export function getDeploymentStats() {
  return {
    total:      store.length,
    deployed:   store.filter(d => d.status === "deployed").length,
    failed:     store.filter(d => d.status === "failed").length,
    rolledBack: store.filter(d => d.status === "rolled-back").length,
    byNetwork:  Object.fromEntries(NETWORKS.map(n => [n, store.filter(d => d.network === n).length])),
    byType:     Object.fromEntries((["contract","service","upgrade","migration"] as DeploymentType[]).map(t => [t, store.filter(d => d.type === t).length])),
    totalGasUsed: store.reduce((s, d) => s + (d.gasUsed ?? 0), 0),
  };
}

seed();
