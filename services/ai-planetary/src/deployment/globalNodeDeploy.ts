/**
 * Global Node Deployment — autonomously provisions blockchain nodes in regions worldwide.
 */

import { v4 as uuid } from "uuid";
import logger          from "../utils/logger";

export type NodeType    = "validator" | "rpc-gateway" | "archive" | "edge" | "bootnode" | "light";
export type NodeStatus  = "provisioning" | "syncing" | "online" | "degraded" | "offline" | "decommissioned";
export type NetworkName = "GhostChain" | "GhostL2" | "GhostL3";

export interface RegionInfo {
  id:        string;
  name:      string;
  continent: string;
  lat:       number;
  lon:       number;
  cloud:     string;
}

export interface GlobalNode {
  id:          string;
  name:        string;
  type:        NodeType;
  region:      RegionInfo;
  network:     NetworkName;
  status:      NodeStatus;
  ip:          string;
  p2pPort:     number;
  rpcPort:     number;
  peerCount:   number;
  blockHeight: number;
  latency_ms:  number;
  uptime:      number;  // %
  cpu:         number;  // %
  memory:      number;  // %
  deployedAt:  number;
  version:     string;
}

const MAX_NODES = 500;
const store: GlobalNode[] = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(a: number, b: number)  { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randf(a: number, b: number) { return parseFloat((Math.random() * (b - a) + a).toFixed(1)); }

function randIp(): string {
  return [rand(10,250), rand(0,255), rand(0,255), rand(1,254)].join(".");
}

export const REGIONS: RegionInfo[] = [
  { id: "us-east",    name: "US East (Virginia)",      continent: "North America", lat:  37.5,  lon: -77.5,  cloud: "AWS"   },
  { id: "us-west",    name: "US West (Oregon)",         continent: "North America", lat:  45.5,  lon: -122.7, cloud: "AWS"   },
  { id: "us-central", name: "US Central (Chicago)",     continent: "North America", lat:  41.9,  lon: -87.6,  cloud: "Azure" },
  { id: "eu-west",    name: "EU West (Ireland)",        continent: "Europe",        lat:  53.3,  lon:  -6.3,  cloud: "AWS"   },
  { id: "eu-central", name: "EU Central (Frankfurt)",   continent: "Europe",        lat:  50.1,  lon:   8.7,  cloud: "AWS"   },
  { id: "eu-north",   name: "EU North (Stockholm)",     continent: "Europe",        lat:  59.3,  lon:  18.1,  cloud: "Azure" },
  { id: "ap-east",    name: "Asia Pacific (Tokyo)",     continent: "Asia",          lat:  35.7,  lon: 139.7,  cloud: "AWS"   },
  { id: "ap-south",   name: "Asia Pacific (Singapore)", continent: "Asia",          lat:   1.4,  lon: 103.8,  cloud: "GCP"   },
  { id: "ap-sydney",  name: "Asia Pacific (Sydney)",    continent: "Oceania",       lat: -33.9,  lon: 151.2,  cloud: "AWS"   },
  { id: "sa-east",    name: "South America (São Paulo)",continent: "South America", lat: -23.5,  lon: -46.6,  cloud: "AWS"   },
  { id: "af-south",   name: "Africa (Cape Town)",       continent: "Africa",        lat: -33.9,  lon:  18.4,  cloud: "AWS"   },
  { id: "me-south",   name: "Middle East (Bahrain)",    continent: "Asia",          lat:  26.0,  lon:  50.6,  cloud: "AWS"   },
  { id: "in-south",   name: "India (Mumbai)",           continent: "Asia",          lat:  19.1,  lon:  72.9,  cloud: "GCP"   },
  { id: "ca-central", name: "Canada (Montreal)",        continent: "North America", lat:  45.5,  lon: -73.6,  cloud: "AWS"   },
  { id: "jp-osaka",   name: "Asia Pacific (Osaka)",     continent: "Asia",          lat:  34.7,  lon: 135.5,  cloud: "AWS"   },
  { id: "kr-seoul",   name: "Asia Pacific (Seoul)",     continent: "Asia",          lat:  37.6,  lon: 126.9,  cloud: "AWS"   },
  { id: "au-perth",   name: "Australia (Perth)",        continent: "Oceania",       lat: -31.9,  lon: 115.9,  cloud: "Azure" },
  { id: "br-sao",     name: "Brazil (Fortaleza)",       continent: "South America", lat:  -3.7,  lon: -38.5,  cloud: "AWS"   },
  { id: "za-jhb",     name: "Africa (Johannesburg)",    continent: "Africa",        lat: -26.2,  lon:  28.0,  cloud: "Azure" },
  { id: "ng-lag",     name: "Africa (Lagos)",           continent: "Africa",        lat:   6.5,  lon:   3.4,  cloud: "GCP"   },
];

const NETWORKS: NetworkName[] = ["GhostChain", "GhostL2", "GhostL3"];
const NODE_TYPES: NodeType[]  = ["validator", "rpc-gateway", "archive", "edge", "bootnode", "light"];
const VERSIONS = ["v2.4.1", "v2.4.0", "v2.3.9", "v2.3.8"];

function makeNode(region: RegionInfo, type: NodeType, network: NetworkName, hoursAgo: number): GlobalNode {
  const online = Math.random() > 0.08;
  return {
    id:          uuid(),
    name:        `${region.id}-${type}-${rand(1, 99).toString().padStart(2, "0")}`,
    type,
    region,
    network,
    status:      online ? (Math.random() > 0.95 ? "degraded" : "online") : pick(["provisioning","syncing","offline"] as NodeStatus[]),
    ip:          randIp(),
    p2pPort:     30303,
    rpcPort:     8545,
    peerCount:   online ? rand(8, 120) : 0,
    blockHeight: online ? rand(1_000_000, 15_000_000) : 0,
    latency_ms:  online ? rand(2, 280) : 9999,
    uptime:      online ? randf(95, 100) : randf(0, 50),
    cpu:         randf(5, online ? 75 : 0),
    memory:      randf(20, online ? 85 : 10),
    deployedAt:  Date.now() - hoursAgo * 3_600_000,
    version:     pick(VERSIONS),
  };
}

function seed() {
  // Deploy 3-6 nodes per major region
  const majorRegions = REGIONS.slice(0, 12);
  majorRegions.forEach(region => {
    const count = rand(3, 6);
    for (let i = 0; i < count; i++) {
      const net  = pick(NETWORKS);
      const type = pick(NODE_TYPES);
      store.push(makeNode(region, type, net, rand(1, 720)));
    }
  });
  logger.info(`[GlobalNodeDeploy] Seeded ${store.length} global nodes`);
}

export function deployNode(regionId: string, type: NodeType = "validator", network: NetworkName = "GhostChain"): GlobalNode {
  const region = REGIONS.find(r => r.id === regionId) ?? pick(REGIONS);
  const node   = makeNode(region, type, network, 0);
  node.status  = "provisioning";
  store.unshift(node);
  if (store.length > MAX_NODES) store.pop();
  logger.info(`[GlobalNodeDeploy] Deploying ${type} node in ${region.name} on ${network}`);
  setTimeout(() => {
    node.status      = "syncing";
    setTimeout(() => { node.status = "online"; node.blockHeight = rand(1_000_000, 15_000_000); }, rand(3000, 8000));
  }, rand(1000, 3000));
  return node;
}

export function getNodes(opts: { regionId?: string; type?: NodeType; network?: NetworkName; status?: NodeStatus; limit?: number } = {}): GlobalNode[] {
  let nodes = [...store];
  if (opts.regionId) nodes = nodes.filter(n => n.region.id === opts.regionId);
  if (opts.type)     nodes = nodes.filter(n => n.type      === opts.type);
  if (opts.network)  nodes = nodes.filter(n => n.network   === opts.network);
  if (opts.status)   nodes = nodes.filter(n => n.status    === opts.status);
  return nodes.slice(0, opts.limit ?? 100);
}

export function getNodeStats() {
  const online = store.filter(n => n.status === "online").length;
  const byRegion = Object.fromEntries(REGIONS.map(r => [r.id, store.filter(n => n.region.id === r.id).length]));
  const byNetwork = Object.fromEntries(NETWORKS.map(n => [n, store.filter(nd => nd.network === n).length]));
  return {
    total: store.length, online, offline: store.filter(n => n.status === "offline").length,
    degraded: store.filter(n => n.status === "degraded").length,
    regions: [...new Set(store.map(n => n.region.id))].length,
    avgLatency: online ? Math.round(store.filter(n => n.status === "online").reduce((s, n) => s + n.latency_ms, 0) / Math.max(online, 1)) : 0,
    byRegion, byNetwork,
  };
}

export { REGIONS as REGION_LIST };

seed();
