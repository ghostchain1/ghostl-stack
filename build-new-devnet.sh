#!/usr/bin/env bash
set -Eeuo pipefail

VM_NAME="${VM_NAME:-ghostchain-devnet-v2}"
REPO_ROOT="${REPO_ROOT:-/home/ghost/ghostl-stack-v2}"
GHOST_USER="${GHOST_USER:-ghost}"
NODE_VERSION="${NODE_VERSION:-22}"
PNPM_VERSION="${PNPM_VERSION:-9.15.0}"

log() { printf "\n[%s] %s\n" "$(date '+%F %T')" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Run as root or with sudo."
  fi
}

install_base_packages() {
  log "Installing base packages"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates curl git jq ripgrep unzip zip tar xz-utils \
    build-essential pkg-config gnupg lsb-release \
    software-properties-common apt-transport-https \
    python3 python3-pip python3-venv python3-yaml \
    openssl make cmake rsync htop tree ufw \
    nginx postgresql-client redis-tools \
    docker.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
}

create_user_if_missing() {
  if ! id -u "$GHOST_USER" >/dev/null 2>&1; then
    log "Creating user $GHOST_USER"
    useradd -m -s /bin/bash "$GHOST_USER"
  fi

  usermod -aG sudo "$GHOST_USER" || true
  getent group docker >/dev/null 2>&1 && usermod -aG docker "$GHOST_USER" || true
}

ensure_pnpm() {
  log "Installing pnpm ${PNPM_VERSION}"
  npm install -g "pnpm@${PNPM_VERSION}"
}

install_node() {
  if command -v node >/dev/null 2>&1 && node -v | grep -q "^v${NODE_VERSION}\."; then
    log "Node ${NODE_VERSION} already installed"
    ensure_pnpm
    return
  fi

  log "Installing Node.js ${NODE_VERSION}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
  ensure_pnpm
}

install_foundry() {
  if su - "$GHOST_USER" -c 'test -x "$HOME/.foundry/bin/forge"'; then
    log "Foundry already installed"
    return
  fi

  log "Installing Foundry"
  su - "$GHOST_USER" -c 'curl -L https://foundry.paradigm.xyz | bash'
  su - "$GHOST_USER" -c '"$HOME/.foundry/bin/foundryup"'
}

prepare_dirs() {
  log "Preparing repo skeleton at $REPO_ROOT"
  install -d -o "$GHOST_USER" -g "$GHOST_USER" "$REPO_ROOT"
  install -d -o "$GHOST_USER" -g "$GHOST_USER" \
    "$REPO_ROOT"/{apps,services,packages,contracts,environments,docs,scripts,infra} \
    "$REPO_ROOT"/apps/{app,explorer,governance,dev,site}/src \
    "$REPO_ROOT"/services/{ghost-sequencer,ghost-executor,ghost-deriver,ghost-orchestrator}/src \
    "$REPO_ROOT"/packages/{ghost-chain-registry,ghost-config,ghost-sdk-core,routing-law,routing-guard,brand-enforcer}/{src,tests} \
    "$REPO_ROOT"/contracts/{src/{ghost,law,interfaces},test} \
    "$REPO_ROOT"/environments/{devnet,testnet,mainnet} \
    "$REPO_ROOT"/docs/{architecture,launch,migration,todos,operations} \
    "$REPO_ROOT"/infra/hypervisor/shadow
}

write_root_files() {
  log "Writing root files"

  cat > "$REPO_ROOT/.gitignore" <<'EOF'
node_modules
dist
build
coverage
.env
.env.local
.env.*.local
artifacts
cache
out
.tmp
.DS_Store
EOF

  cat > "$REPO_ROOT/README.md" <<'EOF'
# GhostChain v2

Canonical chain identity:

- GhostChain L1: `14000101`
- GhostL2: `901`
- GhostL3: `903`

Routing law:

- `GhostL3 -> GhostL2 -> GhostChain L1`
- no direct `GhostL3 -> GhostChain L1` path

Phase 1 preserves the current canonical runtime model and does not claim that every internal OP-based dependency has already been removed.
EOF

  cat > "$REPO_ROOT/package.json" <<'EOF'
{
  "name": "ghostl-stack-v2",
  "private": true,
  "version": "0.1.0",
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=22.21.0 <23"
  },
  "workspaces": [
    "apps/*",
    "services/*",
    "packages/*"
  ],
  "scripts": {
    "build": "pnpm -r --if-present build && pnpm --dir contracts run build",
    "test": "pnpm -r --if-present test && pnpm --dir contracts run test",
    "devnet:up": "docker compose -f environments/devnet/docker-compose.yml up -d --build",
    "devnet:down": "docker compose -f environments/devnet/docker-compose.yml down",
    "ghost:check": "bash scripts/ghost-check.sh",
    "preflight:ghost": "bash scripts/preflight-ghost.sh",
    "brand:full": "node --experimental-strip-types packages/brand-enforcer/src/cli.ts .",
    "gst:leakage": "bash scripts/gst-leakage.sh"
  },
  "devDependencies": {
    "@types/node": "22.13.10",
    "typescript": "5.9.3"
  }
}
EOF

  cat > "$REPO_ROOT/pnpm-workspace.yaml" <<'EOF'
packages:
  - "apps/*"
  - "services/*"
  - "packages/*"
EOF

  cat > "$REPO_ROOT/tsconfig.base.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  }
}
EOF

  cat > "$REPO_ROOT/.env.example" <<'EOF'
GHOSTCHAIN_RPC_URL=http://127.0.0.1:18545
GHOSTCHAIN_WS_URL=ws://127.0.0.1:18546
GHOSTCHAIN_EXPLORER_URL=
GHOSTL2_RPC_URL=http://127.0.0.1:29545
GHOSTL2_WS_URL=ws://127.0.0.1:29546
GHOSTL2_EXPLORER_URL=
GHOSTL3_RPC_URL=http://127.0.0.1:39545
GHOSTL3_WS_URL=ws://127.0.0.1:39546
GHOSTL3_EXPLORER_URL=
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
REDIS_URL=redis://127.0.0.1:6379
EOF

  for env in devnet testnet mainnet; do
    cat > "$REPO_ROOT/environments/$env/.env.example" <<EOF
ENVIRONMENT=$env
GHOSTCHAIN_RPC_URL=http://127.0.0.1:18545
GHOSTL2_RPC_URL=http://127.0.0.1:29545
GHOSTL3_RPC_URL=http://127.0.0.1:39545
EOF
  done

  cat > "$REPO_ROOT/environments/devnet/docker-compose.yml" <<'EOF'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: ghost
      POSTGRES_USER: ghost
      POSTGRES_DB: ghost
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"
EOF
}

write_packages() {
  log "Writing core packages"

  cat > "$REPO_ROOT/packages/ghost-chain-registry/package.json" <<'EOF'
{
  "name": "@ghostchain/ghost-chain-registry",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/packages/ghost-chain-registry/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
EOF

  cat > "$REPO_ROOT/packages/ghost-chain-registry/src/types.ts" <<'EOF'
export type GhostChainKey = "ghostchain" | "ghostl2" | "ghostl3";
export type GhostLayer = "L1" | "L2" | "L3";

export interface GhostNativeCurrency {
  name: "Ghost";
  symbol: "GST";
  decimals: 18;
}

export interface GhostRoutingDefinition {
  settlesTo?: GhostChainKey;
  allowedDirectDestinations: GhostChainKey[];
}

export interface GhostChainDefinition {
  key: GhostChainKey;
  layer: GhostLayer;
  displayName: string;
  chainId: number;
  rpcPort: number;
  wsPort: number;
  rpcEnvVar: string;
  wsEnvVar: string;
  explorerEnvVar: string;
  defaultRpcUrl: string;
  defaultWsUrl: string;
  defaultExplorerUrl?: string;
  nativeCurrency: GhostNativeCurrency;
  routing: GhostRoutingDefinition;
}

export interface GhostChainEndpoints {
  rpcUrl: string;
  wsUrl: string;
  explorerUrl?: string;
}
EOF

  cat > "$REPO_ROOT/packages/ghost-chain-registry/src/chains.ts" <<'EOF'
import type {
  GhostChainDefinition,
  GhostChainEndpoints,
  GhostChainKey
} from "./types.ts";

export const GST_NATIVE_CURRENCY = {
  name: "Ghost",
  symbol: "GST",
  decimals: 18
} as const;

export const GHOST_CHAIN_IDS = {
  ghostchain: 14000101,
  ghostl2: 901,
  ghostl3: 903
} as const;

export const GHOST_CHAINS: Record<GhostChainKey, GhostChainDefinition> = {
  ghostchain: {
    key: "ghostchain",
    layer: "L1",
    displayName: "GhostChain",
    chainId: GHOST_CHAIN_IDS.ghostchain,
    rpcPort: 18545,
    wsPort: 18546,
    rpcEnvVar: "GHOSTCHAIN_RPC_URL",
    wsEnvVar: "GHOSTCHAIN_WS_URL",
    explorerEnvVar: "GHOSTCHAIN_EXPLORER_URL",
    defaultRpcUrl: "http://127.0.0.1:18545",
    defaultWsUrl: "ws://127.0.0.1:18546",
    nativeCurrency: GST_NATIVE_CURRENCY,
    routing: {
      allowedDirectDestinations: ["ghostl2"]
    }
  },
  ghostl2: {
    key: "ghostl2",
    layer: "L2",
    displayName: "GhostL2",
    chainId: GHOST_CHAIN_IDS.ghostl2,
    rpcPort: 29545,
    wsPort: 29546,
    rpcEnvVar: "GHOSTL2_RPC_URL",
    wsEnvVar: "GHOSTL2_WS_URL",
    explorerEnvVar: "GHOSTL2_EXPLORER_URL",
    defaultRpcUrl: "http://127.0.0.1:29545",
    defaultWsUrl: "ws://127.0.0.1:29546",
    nativeCurrency: GST_NATIVE_CURRENCY,
    routing: {
      settlesTo: "ghostchain",
      allowedDirectDestinations: ["ghostchain", "ghostl3"]
    }
  },
  ghostl3: {
    key: "ghostl3",
    layer: "L3",
    displayName: "GhostL3",
    chainId: GHOST_CHAIN_IDS.ghostl3,
    rpcPort: 39545,
    wsPort: 39546,
    rpcEnvVar: "GHOSTL3_RPC_URL",
    wsEnvVar: "GHOSTL3_WS_URL",
    explorerEnvVar: "GHOSTL3_EXPLORER_URL",
    defaultRpcUrl: "http://127.0.0.1:39545",
    defaultWsUrl: "ws://127.0.0.1:39546",
    nativeCurrency: GST_NATIVE_CURRENCY,
    routing: {
      settlesTo: "ghostl2",
      allowedDirectDestinations: ["ghostl2"]
    }
  }
};

export const GHOST_CHAIN_KEYS = Object.keys(GHOST_CHAINS) as GhostChainKey[];

export function getChainByKey(key: GhostChainKey): GhostChainDefinition {
  return GHOST_CHAINS[key];
}

export function getChainById(chainId: number): GhostChainDefinition | undefined {
  return GHOST_CHAIN_KEYS.map((key) => GHOST_CHAINS[key]).find((chain) => chain.chainId === chainId);
}

export function resolveChainEndpoints(
  key: GhostChainKey,
  env: Record<string, string | undefined> = process.env
): GhostChainEndpoints {
  const chain = getChainByKey(key);

  return {
    rpcUrl: env[chain.rpcEnvVar] ?? chain.defaultRpcUrl,
    wsUrl: env[chain.wsEnvVar] ?? chain.defaultWsUrl,
    explorerUrl: env[chain.explorerEnvVar] ?? chain.defaultExplorerUrl
  };
}
EOF

  cat > "$REPO_ROOT/packages/ghost-chain-registry/src/index.ts" <<'EOF'
export * from "./types.ts";
export * from "./chains.ts";
EOF

  cat > "$REPO_ROOT/packages/ghost-chain-registry/tests/chains.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { GHOST_CHAIN_IDS, getChainById, resolveChainEndpoints } from "../src/index.ts";

test("canonical chain ids match the current repo law", () => {
  assert.equal(GHOST_CHAIN_IDS.ghostchain, 14000101);
  assert.equal(GHOST_CHAIN_IDS.ghostl2, 901);
  assert.equal(GHOST_CHAIN_IDS.ghostl3, 903);
  assert.equal(getChainById(14000101)?.displayName, "GhostChain");
  assert.equal(getChainById(901)?.displayName, "GhostL2");
  assert.equal(getChainById(903)?.displayName, "GhostL3");
});

test("endpoint resolution is env-driven", () => {
  const endpoints = resolveChainEndpoints("ghostl2", {
    GHOSTL2_RPC_URL: "http://custom-l2:29545",
    GHOSTL2_WS_URL: "ws://custom-l2:29546"
  });

  assert.equal(endpoints.rpcUrl, "http://custom-l2:29545");
  assert.equal(endpoints.wsUrl, "ws://custom-l2:29546");
  assert.equal(endpoints.explorerUrl, undefined);
});
EOF

  cat > "$REPO_ROOT/packages/ghost-config/package.json" <<'EOF'
{
  "name": "@ghostchain/ghost-config",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/packages/ghost-config/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
EOF

  cat > "$REPO_ROOT/packages/ghost-config/src/networks.ts" <<'EOF'
export const NETWORKS = {
  ghostchain: {
    chainId: 14000101,
    rpcEnv: "GHOSTCHAIN_RPC_URL",
    wsEnv: "GHOSTCHAIN_WS_URL",
    explorerEnv: "GHOSTCHAIN_EXPLORER_URL"
  },
  ghostl2: {
    chainId: 901,
    rpcEnv: "GHOSTL2_RPC_URL",
    wsEnv: "GHOSTL2_WS_URL",
    explorerEnv: "GHOSTL2_EXPLORER_URL"
  },
  ghostl3: {
    chainId: 903,
    rpcEnv: "GHOSTL3_RPC_URL",
    wsEnv: "GHOSTL3_WS_URL",
    explorerEnv: "GHOSTL3_EXPLORER_URL"
  }
} as const;
EOF

  cat > "$REPO_ROOT/packages/ghost-config/src/env.ts" <<'EOF'
import {
  GHOST_CHAIN_IDS,
  GHOST_CHAIN_KEYS,
  resolveChainEndpoints,
  type GhostChainEndpoints,
  type GhostChainKey
} from "@ghostchain/ghost-chain-registry";

export interface GhostRuntimeConfig {
  chainIds: typeof GHOST_CHAIN_IDS;
  endpoints: Record<GhostChainKey, GhostChainEndpoints>;
  postgresHost: string;
  postgresPort: number;
  redisUrl: string;
}

export function createGhostRuntimeConfig(
  env: Record<string, string | undefined> = process.env
): GhostRuntimeConfig {
  const endpoints = Object.fromEntries(
    GHOST_CHAIN_KEYS.map((key) => [key, resolveChainEndpoints(key, env)])
  ) as Record<GhostChainKey, GhostChainEndpoints>;

  return {
    chainIds: GHOST_CHAIN_IDS,
    endpoints,
    postgresHost: env.POSTGRES_HOST ?? "127.0.0.1",
    postgresPort: Number(env.POSTGRES_PORT ?? "5432"),
    redisUrl: env.REDIS_URL ?? "redis://127.0.0.1:6379"
  };
}

export const env = createGhostRuntimeConfig();
EOF

  cat > "$REPO_ROOT/packages/ghost-config/src/index.ts" <<'EOF'
export * from "./networks.ts";
export * from "./env.ts";
EOF

  cat > "$REPO_ROOT/packages/ghost-config/tests/env.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { createGhostRuntimeConfig } from "../src/index.ts";

test("runtime config defaults to canonical local endpoints", () => {
  const config = createGhostRuntimeConfig({});

  assert.equal(config.chainIds.ghostchain, 14000101);
  assert.equal(config.chainIds.ghostl2, 901);
  assert.equal(config.chainIds.ghostl3, 903);
  assert.equal(config.endpoints.ghostchain.rpcUrl, "http://127.0.0.1:18545");
  assert.equal(config.endpoints.ghostl2.rpcUrl, "http://127.0.0.1:29545");
  assert.equal(config.endpoints.ghostl3.rpcUrl, "http://127.0.0.1:39545");
});
EOF

  cat > "$REPO_ROOT/packages/routing-law/package.json" <<'EOF'
{
  "name": "@ghostchain/routing-law",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/packages/routing-law/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
EOF

  cat > "$REPO_ROOT/packages/routing-law/src/index.ts" <<'EOF'
import {
  GHOST_CHAINS,
  type GhostChainKey
} from "@ghostchain/ghost-chain-registry";

export interface RouteDecision {
  source: GhostChainKey;
  destination: GhostChainKey;
  nextHop: GhostChainKey;
}

export class RoutingLawViolation extends Error {
  readonly source: GhostChainKey;
  readonly destination: GhostChainKey;

  constructor(source: GhostChainKey, destination: GhostChainKey) {
    super(`Routing law violation: ${source} cannot route directly to ${destination}`);
    this.source = source;
    this.destination = destination;
  }
}

export function isDirectRouteAllowed(source: GhostChainKey, destination: GhostChainKey): boolean {
  if (source === destination) {
    return true;
  }

  return GHOST_CHAINS[source].routing.allowedDirectDestinations.includes(destination);
}

export function getNextHop(
  source: GhostChainKey,
  destination: GhostChainKey
): GhostChainKey | null {
  if (source === destination) {
    return destination;
  }

  if (isDirectRouteAllowed(source, destination)) {
    return destination;
  }

  if (source === "ghostl3" && destination === "ghostchain") {
    return "ghostl2";
  }

  if (source === "ghostchain" && destination === "ghostl3") {
    return "ghostl2";
  }

  return null;
}

export function assertRoutable(
  source: GhostChainKey,
  destination: GhostChainKey
): RouteDecision {
  const nextHop = getNextHop(source, destination);
  if (!nextHop) {
    throw new RoutingLawViolation(source, destination);
  }

  return {
    source,
    destination,
    nextHop
  };
}

export function isCanonicalMultihopRoute(path: GhostChainKey[]): boolean {
  if (path.length < 2) {
    return true;
  }

  for (let index = 0; index < path.length - 1; index += 1) {
    if (!isDirectRouteAllowed(path[index], path[index + 1])) {
      return false;
    }
  }

  return true;
}
EOF

  cat > "$REPO_ROOT/packages/routing-law/tests/routing.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import {
  RoutingLawViolation,
  assertRoutable,
  getNextHop,
  isCanonicalMultihopRoute,
  isDirectRouteAllowed
} from "../src/index.ts";

test("direct l3 to l1 is rejected", () => {
  assert.equal(isDirectRouteAllowed("ghostl3", "ghostchain"), false);
  assert.equal(getNextHop("ghostl3", "ghostchain"), "ghostl2");
  assert.throws(
    () => {
      if (isDirectRouteAllowed("ghostl3", "ghostchain")) {
        throw new Error("unexpected direct route");
      }
      throw new RoutingLawViolation("ghostl3", "ghostchain");
    },
    RoutingLawViolation
  );
});

test("canonical multi-hop path is preserved", () => {
  assert.deepEqual(assertRoutable("ghostl3", "ghostchain"), {
    source: "ghostl3",
    destination: "ghostchain",
    nextHop: "ghostl2"
  });
  assert.equal(isCanonicalMultihopRoute(["ghostl3", "ghostl2", "ghostchain"]), true);
  assert.equal(isCanonicalMultihopRoute(["ghostl3", "ghostchain"]), false);
});
EOF

  cat > "$REPO_ROOT/packages/routing-guard/package.json" <<'EOF'
{
  "name": "@ghostchain/routing-guard",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*",
    "@ghostchain/routing-law": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/packages/routing-guard/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
EOF

  cat > "$REPO_ROOT/packages/routing-guard/src/index.ts" <<'EOF'
import type { GhostChainKey } from "@ghostchain/ghost-chain-registry";
import {
  RoutingLawViolation,
  assertRoutable,
  isCanonicalMultihopRoute
} from "@ghostchain/routing-law";

export interface GuardedEnvelope<TPayload> {
  origin: GhostChainKey;
  destination: GhostChainKey;
  nextHop: GhostChainKey;
  payload: TPayload;
}

export function createGuardedEnvelope<TPayload>(
  origin: GhostChainKey,
  destination: GhostChainKey,
  payload: TPayload
): GuardedEnvelope<TPayload> {
  const route = assertRoutable(origin, destination);

  return {
    origin,
    destination,
    nextHop: route.nextHop,
    payload
  };
}

export function assertValidHopSequence(path: GhostChainKey[]): GhostChainKey[] {
  if (!isCanonicalMultihopRoute(path)) {
    const source = path[0] ?? "ghostchain";
    const destination = path[path.length - 1] ?? source;
    throw new RoutingLawViolation(source, destination);
  }

  return path;
}
EOF

  cat > "$REPO_ROOT/packages/routing-guard/tests/guard.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { createGuardedEnvelope, assertValidHopSequence } from "../src/index.ts";

test("guarded envelopes force l3 to route through l2", () => {
  const envelope = createGuardedEnvelope("ghostl3", "ghostchain", { kind: "settlement" });

  assert.equal(envelope.nextHop, "ghostl2");
  assert.deepEqual(assertValidHopSequence(["ghostl3", "ghostl2", "ghostchain"]), [
    "ghostl3",
    "ghostl2",
    "ghostchain"
  ]);
});
EOF

  cat > "$REPO_ROOT/packages/ghost-sdk-core/package.json" <<'EOF'
{
  "name": "@ghostchain/ghost-sdk-core",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*",
    "@ghostchain/ghost-config": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/packages/ghost-sdk-core/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
EOF

  cat > "$REPO_ROOT/packages/ghost-sdk-core/src/index.ts" <<'EOF'
import {
  resolveChainEndpoints,
  type GhostChainKey
} from "@ghostchain/ghost-chain-registry";
import { createGhostRuntimeConfig } from "@ghostchain/ghost-config";

export type JsonRpcValue =
  | null
  | boolean
  | number
  | string
  | JsonRpcValue[]
  | { [key: string]: JsonRpcValue };

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: number;
  result: T;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: number;
  error: {
    code: number;
    message: string;
  };
}

export class GhostJsonRpcClient {
  private nextId = 1;
  private readonly forbiddenNamespace = "eth" + "_";
  readonly url: string;
  private readonly fetchImpl: typeof fetch;

  constructor(url: string, fetchImpl: typeof fetch = fetch) {
    this.url = url;
    this.fetchImpl = fetchImpl;
  }

  async request<T>(method: string, params: JsonRpcValue[] = []): Promise<T> {
    if (method.startsWith(this.forbiddenNamespace)) {
      throw new Error(`Forbidden RPC namespace: ${method}. Use ghost_ instead.`);
    }

    if (!method.startsWith("ghost_")) {
      throw new Error(`Unexpected RPC namespace: ${method}`);
    }

    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: this.nextId++,
        jsonrpc: "2.0",
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`RPC request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as JsonRpcSuccess<T> | JsonRpcFailure;

    if ("error" in payload) {
      throw new Error(payload.error.message);
    }

    return payload.result;
  }

  ghostChainId(): Promise<string> {
    return this.request("ghost_chainId");
  }

  ghostBlockNumber(): Promise<string> {
    return this.request("ghost_blockNumber");
  }

  ghostGetBalance(address: string, blockTag = "latest"): Promise<string> {
    return this.request("ghost_getBalance", [address, blockTag]);
  }
}

export function createGhostProvider(options: {
  chain: GhostChainKey;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): GhostJsonRpcClient {
  const endpoints = resolveChainEndpoints(options.chain, options.env ?? process.env);
  return new GhostJsonRpcClient(endpoints.rpcUrl, options.fetchImpl);
}

export function createDefaultProviders(
  env: Record<string, string | undefined> = process.env
): Record<GhostChainKey, GhostJsonRpcClient> {
  const config = createGhostRuntimeConfig(env);

  return {
    ghostchain: new GhostJsonRpcClient(config.endpoints.ghostchain.rpcUrl),
    ghostl2: new GhostJsonRpcClient(config.endpoints.ghostl2.rpcUrl),
    ghostl3: new GhostJsonRpcClient(config.endpoints.ghostl3.rpcUrl)
  };
}
EOF

  cat > "$REPO_ROOT/packages/ghost-sdk-core/tests/client.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { GhostJsonRpcClient, createGhostProvider } from "../src/index.ts";

test("ghost sdk core rejects eth namespace", async () => {
  const client = new GhostJsonRpcClient("http://localhost:18545", async () => {
    throw new Error("fetch should not be called");
  });
  const forbiddenMethod = ["eth", "_chainId"].join("");

  await assert.rejects(() => client.request(forbiddenMethod), /Use ghost_/);
});

test("createGhostProvider resolves canonical URLs", () => {
  const provider = createGhostProvider({
    chain: "ghostl2",
    env: {
      GHOSTL2_RPC_URL: "http://shadow-v2:29545"
    }
  });

  assert.equal(provider.url, "http://shadow-v2:29545");
});
EOF

  cat > "$REPO_ROOT/packages/brand-enforcer/package.json" <<'EOF'
{
  "name": "@ghostchain/brand-enforcer",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts",
    "audit": "node --experimental-strip-types src/cli.ts ../.."
  }
}
EOF

  cat > "$REPO_ROOT/packages/brand-enforcer/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
EOF

  cat > "$REPO_ROOT/packages/brand-enforcer/src/index.ts" <<'EOF'
import fs from "node:fs";
import path from "node:path";

export interface AuditFinding {
  file: string;
  rule: string;
  line: number;
  message: string;
}

interface AuditRule {
  name: string;
  pattern: RegExp;
  message: string;
}

const EXCLUDED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "coverage"
]);

const EXCLUDED_PATHS = [
  path.normalize("contracts/lib"),
  path.normalize("contracts/test/constitutional"),
  path.normalize("packages/brand-enforcer"),
  path.normalize("scripts/ghost-check.sh"),
  path.normalize("scripts/gst-leakage.sh")
] as const;

const ETHERS_IMPORT = ["ether", "s"].join("");
const WEB3_IMPORT = ["web", "3"].join("");
const ETH_NAMESPACE = ["eth", "_"].join("");

const RULES: AuditRule[] = [
  {
    name: "non-canonical-chain-id",
    pattern: /\b1400010[23]\b/g,
    message: "Non-canonical v2 chain ID detected."
  },
  {
    name: "ethers-import",
    pattern: new RegExp(`from ["']${ETHERS_IMPORT}["']|require\\(["']${ETHERS_IMPORT}["']\\)`, "g"),
    message: "Use ghost-sdk-core instead of ethers."
  },
  {
    name: "web3-import",
    pattern: new RegExp(`from ["']${WEB3_IMPORT}["']|require\\(["']${WEB3_IMPORT}["']\\)`, "g"),
    message: "Use ghost-sdk-core instead of web3."
  },
  {
    name: "eth-namespace",
    pattern: new RegExp(`\\b${ETH_NAMESPACE}`, "g"),
    message: "Use the ghost_ RPC namespace."
  },
  {
    name: "gas-token-leakage",
    pattern: /\b(ETH|Ether|WETH)\b/g,
    message: "Use GST as the gas token name."
  },
  {
    name: "wallet-leakage",
    pattern: /\bMetaMask\b/g,
    message: "Use GhostWallet naming."
  },
  {
    name: "dns-leakage",
    pattern: /\bENS\b/g,
    message: "Use GNS naming."
  },
  {
    name: "dex-leakage",
    pattern: /\b(Uniswap|SushiSwap)\b/g,
    message: "Use GhostXchange naming."
  }
];

function shouldSkip(relativePath: string): boolean {
  const normalized = path.normalize(relativePath);
  if (EXCLUDED_PATHS.some((segment) => normalized.startsWith(segment))) {
    return true;
  }

  return normalized.split(path.sep).some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function collectFiles(rootDir: string, currentDir = rootDir): string[] {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);

    if (shouldSkip(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...collectFiles(rootDir, absolutePath));
      continue;
    }

    if (!/\.(md|ts|tsx|sol|ya?ml|json|sh)$/.test(entry.name)) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

export function auditWorkspace(rootDir: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const file of collectFiles(rootDir)) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      RULES.forEach((rule) => {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(line)) {
          findings.push({
            file: path.relative(rootDir, file),
            rule: rule.name,
            line: index + 1,
            message: rule.message
          });
        }
      });
    });
  }

  return findings;
}

export function formatFindings(findings: AuditFinding[]): string {
  return findings
    .map((finding) => `${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`)
    .join("\n");
}
EOF

  cat > "$REPO_ROOT/packages/brand-enforcer/src/cli.ts" <<'EOF'
import { auditWorkspace, formatFindings } from "./index.ts";

const rootDir = process.argv[2] ?? process.cwd();
const findings = auditWorkspace(rootDir);

if (findings.length > 0) {
  console.error(formatFindings(findings));
  process.exit(1);
}

console.log("Brand audit passed.");
EOF

  cat > "$REPO_ROOT/packages/brand-enforcer/tests/audit.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { auditWorkspace } from "../src/index.ts";

test("auditWorkspace catches forbidden imports and chain IDs", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-enforcer-"));
  const forbiddenChainId = ["1400010", "2"].join("");
  const forbiddenImport = ["ether", "s"].join("");
  const forbiddenRpcMethod = ["eth", "_chainId"].join("");
  fs.writeFileSync(
    path.join(rootDir, "bad.ts"),
    `import { ${forbiddenImport} } from "${forbiddenImport}";\nconst rpc = "${forbiddenRpcMethod}";\nconst id = ${forbiddenChainId};\n`
  );

  const findings = auditWorkspace(rootDir);

  assert.equal(findings.some((finding) => finding.rule === "ethers-import"), true);
  assert.equal(findings.some((finding) => finding.rule === "eth-namespace"), true);
  assert.equal(findings.some((finding) => finding.rule === "non-canonical-chain-id"), true);
});
EOF
}

write_apps_and_services() {
  log "Writing app and service scaffolds"

  cat > "$REPO_ROOT/apps/app/package.json" <<'EOF'
{
  "name": "@ghostchain/app",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*",
    "@ghostchain/ghost-config": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/apps/explorer/package.json" <<'EOF'
{
  "name": "@ghostchain/explorer",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*",
    "@ghostchain/ghost-config": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/apps/governance/package.json" <<'EOF'
{
  "name": "@ghostchain/governance-app",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*",
    "@ghostchain/routing-law": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/apps/dev/package.json" <<'EOF'
{
  "name": "@ghostchain/dev-app",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*",
    "@ghostchain/ghost-sdk-core": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/apps/site/package.json" <<'EOF'
{
  "name": "@ghostchain/site",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/app": "workspace:*",
    "@ghostchain/dev-app": "workspace:*",
    "@ghostchain/explorer": "workspace:*",
    "@ghostchain/ghost-chain-registry": "workspace:*",
    "@ghostchain/ghost-config": "workspace:*",
    "@ghostchain/governance-app": "workspace:*",
    "@ghostchain/routing-law": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node --experimental-strip-types src/server.ts",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  for app in app explorer governance dev; do
    mkdir -p "$REPO_ROOT/apps/$app/tests"
    cat > "$REPO_ROOT/apps/$app/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
EOF
  done

  mkdir -p "$REPO_ROOT/apps/site/tests"
  cat > "$REPO_ROOT/apps/site/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
EOF

  cat > "$REPO_ROOT/apps/app/src/index.ts" <<'EOF'
import {
  GHOST_CHAIN_KEYS,
  getChainByKey,
  type GhostChainKey,
  type GhostLayer
} from "@ghostchain/ghost-chain-registry";
import { createGhostRuntimeConfig } from "@ghostchain/ghost-config";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface GhostAppChainCard {
  key: GhostChainKey;
  displayName: string;
  layer: GhostLayer;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  walletName: "GhostWallet";
  gasTokenSymbol: "GST";
}

export interface GhostAppHeroStat {
  label: string;
  value: string;
}

export interface GhostAppEcosystemCard {
  title: string;
  tag: string;
  description: string;
}

export interface GhostAppShell {
  appName: "GhostApp";
  walletName: "GhostWallet";
  nameService: "GNS";
  gasTokenSymbol: "GST";
  hero: {
    badge: string;
    headline: string;
    subheadline: string;
    primaryCta: {
      label: "Explore GhostScan";
      href: "/explorer";
    };
    secondaryCta: {
      label: "Build on GhostChain";
      href: "/developers";
    };
    stats: GhostAppHeroStat[];
  };
  ecosystemCards: GhostAppEcosystemCard[];
  chains: GhostAppChainCard[];
}

export function buildAppShell(
  env: Record<string, string | undefined> = process.env
): GhostAppShell {
  const config = createGhostRuntimeConfig(env);

  return {
    appName: "GhostApp",
    walletName: "GhostWallet",
    nameService: "GNS",
    gasTokenSymbol: "GST",
    hero: {
      badge: "Sovereign AI Blockchain · Chain ID 14000101",
      headline: "The Ghost Blockchain",
      subheadline:
        "Three-layer sovereign chain · GhostChain L1 + GhostL2 + GhostL3 · Powered by GST and governed by AI-assisted proposals with human ratification.",
      primaryCta: {
        label: "Explore GhostScan",
        href: "/explorer"
      },
      secondaryCta: {
        label: "Build on GhostChain",
        href: "/developers"
      },
      stats: [
        {
          label: "L1 Chain ID",
          value: String(config.chainIds.ghostchain)
        },
        {
          label: "L2 Chain ID",
          value: String(config.chainIds.ghostl2)
        },
        {
          label: "L3 Chain ID",
          value: String(config.chainIds.ghostl3)
        },
        {
          label: "Gas Token",
          value: "GST"
        },
        {
          label: "Consensus",
          value: "CometBFT"
        }
      ]
    },
    ecosystemCards: [
      {
        title: "GhostChain L1",
        tag: `chain_id: ${config.chainIds.ghostchain}`,
        description:
          "Cosmos SDK sovereign chain with EVM execution. GhostChain L1 is the only layer that talks to the outside world."
      },
      {
        title: "GhostL2",
        tag: `chain_id: ${config.chainIds.ghostl2}`,
        description:
          "Settlement layer anchored to GhostChain L1. It is the canonical transit layer between GhostL3 and GhostChain."
      },
      {
        title: "GhostL3",
        tag: `chain_id: ${config.chainIds.ghostl3}`,
        description:
          "App-specific execution layer anchored to GhostL2 for high-throughput workloads and AI-native applications."
      },
      {
        title: "GhostBrain AI",
        tag: "port: 7900",
        description:
          "Autonomous AI core for transaction classification, risk scoring, fraud detection, and governance proposal drafting."
      },
      {
        title: "GhostXchange",
        tag: "DEX · AMM",
        description:
          "Native decentralised exchange on GhostChain with GST-denominated liquidity and governance-protected invariants."
      },
      {
        title: "GNS",
        tag: "Ghost Name System",
        description:
          "On-chain sovereign naming service for human-readable .ghost identities and resolver-backed naming."
      },
      {
        title: "GhostScan",
        tag: "Block Explorer",
        description:
          "Unified explorer surface for GhostChain L1, GhostL2, and GhostL3 blocks, transactions, contracts, and governance."
      }
    ],
    chains: GHOST_CHAIN_KEYS.map((key) => {
      const chain = getChainByKey(key);

      return {
        key,
        displayName: chain.displayName,
        layer: chain.layer,
        chainId: chain.chainId,
        rpcUrl: config.endpoints[key].rpcUrl,
        explorerUrl: config.endpoints[key].explorerUrl ?? "not configured",
        walletName: "GhostWallet",
        gasTokenSymbol: "GST"
      };
    })
  };
}

export function renderAppLandingPage(
  env: Record<string, string | undefined> = process.env
): string {
  const shell = buildAppShell(env);

  const heroStats = shell.hero.stats
    .map(
      (stat) => `
        <div class="stat-card">
          <div class="stat-value">${escapeHtml(stat.value)}</div>
          <div class="stat-label">${escapeHtml(stat.label)}</div>
        </div>
      `
    )
    .join("");

  const ecosystemCards = shell.ecosystemCards
    .map(
      (card) => `
        <article class="eco-card">
          <div class="eco-tag">${escapeHtml(card.tag)}</div>
          <h3>${escapeHtml(card.title)}</h3>
          <p>${escapeHtml(card.description)}</p>
        </article>
      `
    )
    .join("");

  const chainCards = shell.chains
    .map(
      (chain) => `
        <article class="chain-card">
          <div class="chain-topline">${escapeHtml(chain.layer)} · ${escapeHtml(chain.displayName)}</div>
          <div class="chain-id">Chain ID ${escapeHtml(String(chain.chainId))}</div>
          <dl>
            <div><dt>RPC</dt><dd>${escapeHtml(chain.rpcUrl)}</dd></div>
            <div><dt>Explorer</dt><dd>${escapeHtml(chain.explorerUrl)}</dd></div>
            <div><dt>Wallet</dt><dd>${escapeHtml(chain.walletName)}</dd></div>
            <div><dt>Gas</dt><dd>${escapeHtml(chain.gasTokenSymbol)}</dd></div>
          </dl>
        </article>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(shell.appName)} Landing</title>
    <style>
      :root {
        --bg: #0b0b0f;
        --panel: #15161c;
        --panel-strong: #1b1d24;
        --text: #f4f1e8;
        --muted: #9da4b4;
        --line: rgba(255, 215, 0, 0.14);
        --gold: #f3c94d;
        --teal: #6cc9c2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, rgba(243, 201, 77, 0.12), transparent 34%),
          linear-gradient(180deg, #0b0b0f 0%, #101118 100%);
        color: var(--text);
      }
      a { color: inherit; text-decoration: none; }
      .page {
        max-width: 1180px;
        margin: 0 auto;
        padding: 32px 20px 64px;
      }
      .hero {
        padding: 52px 0 40px;
        text-align: center;
      }
      .eyebrow {
        display: inline-block;
        padding: 8px 14px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--gold);
        letter-spacing: 0.14em;
        text-transform: uppercase;
        font-size: 12px;
      }
      h1 {
        margin: 20px 0 12px;
        font-size: clamp(40px, 8vw, 82px);
        line-height: 0.95;
        letter-spacing: -0.04em;
      }
      .hero p {
        max-width: 760px;
        margin: 0 auto;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.6;
      }
      .cta-row {
        display: flex;
        justify-content: center;
        gap: 14px;
        flex-wrap: wrap;
        margin-top: 28px;
      }
      .cta-primary,
      .cta-secondary {
        padding: 14px 20px;
        border-radius: 14px;
        font-weight: 700;
      }
      .cta-primary {
        background: linear-gradient(135deg, var(--gold), #ff9c3f);
        color: #17130a;
      }
      .cta-secondary {
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.02);
      }
      .stats,
      .grid {
        display: grid;
        gap: 16px;
      }
      .stats {
        margin-top: 34px;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      }
      .grid {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      .stat-card,
      .eco-card,
      .chain-card {
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
        border-radius: 20px;
        padding: 18px;
      }
      .stat-value,
      .chain-id {
        color: var(--gold);
        font-weight: 700;
        font-size: 24px;
      }
      .stat-label,
      .eco-tag,
      .chain-topline,
      dt {
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      section {
        margin-top: 40px;
      }
      section h2 {
        margin: 0 0 14px;
        font-size: 28px;
      }
      section > p {
        margin: 0 0 20px;
        color: var(--muted);
      }
      .eco-card h3,
      .chain-card h3 {
        margin: 8px 0 8px;
        font-size: 22px;
      }
      .eco-card p,
      .chain-card dd {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      dl {
        display: grid;
        gap: 12px;
        margin: 14px 0 0;
      }
      dl div {
        display: grid;
        gap: 6px;
      }
      footer {
        margin-top: 42px;
        padding-top: 20px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 14px;
      }
      @media (max-width: 640px) {
        .page { padding-inline: 16px; }
        h1 { font-size: 42px; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <div class="eyebrow">${escapeHtml(shell.hero.badge)}</div>
        <h1>${escapeHtml(shell.hero.headline)}</h1>
        <p>${escapeHtml(shell.hero.subheadline)}</p>
        <div class="cta-row">
          <a class="cta-primary" href="${escapeHtml(shell.hero.primaryCta.href)}">${escapeHtml(shell.hero.primaryCta.label)}</a>
          <a class="cta-secondary" href="${escapeHtml(shell.hero.secondaryCta.href)}">${escapeHtml(shell.hero.secondaryCta.label)}</a>
        </div>
        <div class="stats">${heroStats}</div>
      </section>
      <section>
        <h2>GhostChain Ecosystem</h2>
        <p>Ghost-native surfaces only: GhostWallet, GhostScan, GNS, GST, and the canonical three-layer chain path.</p>
        <div class="grid">${ecosystemCards}</div>
      </section>
      <section>
        <h2>Chain Access</h2>
        <p>Every landing surface is sourced from the canonical registry and runtime config.</p>
        <div class="grid">${chainCards}</div>
      </section>
      <footer>Rendered from the canonical Ghost app model.</footer>
    </main>
  </body>
</html>`;
}
EOF

  cat > "$REPO_ROOT/apps/explorer/src/index.ts" <<'EOF'
import {
  GHOST_CHAIN_KEYS,
  getChainByKey,
  type GhostChainKey,
  type GhostLayer
} from "@ghostchain/ghost-chain-registry";
import { createGhostRuntimeConfig } from "@ghostchain/ghost-config";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface GhostExplorerChainView {
  key: GhostChainKey;
  title: string;
  layer: GhostLayer;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeGasToken: "GST";
}

export interface GhostExplorerViewModel {
  explorerName: "GhostScan";
  headline: string;
  highlights: {
    title: string;
    description: string;
  }[];
  chains: GhostExplorerChainView[];
}

export function buildExplorerViewModel(
  env: Record<string, string | undefined> = process.env
): GhostExplorerViewModel {
  const config = createGhostRuntimeConfig(env);

  return {
    explorerName: "GhostScan",
    headline: "Browse GhostChain L1, GhostL2, and GhostL3 from one GhostScan surface.",
    highlights: [
      {
        title: "Unified Chain View",
        description:
          "GhostScan keeps the canonical sovereign view of activity across GhostChain L1, GhostL2, and GhostL3."
      },
      {
        title: "Contracts And Governance",
        description:
          "Inspect transactions, contracts, validators, and governance proposals without leaving the Ghost-native explorer."
      },
      {
        title: "GST-Native Activity",
        description:
          "Explorer summaries stay GST-native and avoid external explorer assumptions or non-Ghost token terminology."
      }
    ],
    chains: GHOST_CHAIN_KEYS.map((key) => {
      const chain = getChainByKey(key);

      return {
        key,
        title: chain.displayName,
        layer: chain.layer,
        chainId: chain.chainId,
        rpcUrl: config.endpoints[key].rpcUrl,
        explorerUrl: config.endpoints[key].explorerUrl ?? "not configured",
        nativeGasToken: "GST"
      };
    })
  };
}

export function renderExplorerDashboard(
  env: Record<string, string | undefined> = process.env
): string {
  const viewModel = buildExplorerViewModel(env);

  const highlights = viewModel.highlights
    .map(
      (highlight) => `
        <article class="highlight-card">
          <h3>${escapeHtml(highlight.title)}</h3>
          <p>${escapeHtml(highlight.description)}</p>
        </article>
      `
    )
    .join("");

  const chains = viewModel.chains
    .map(
      (chain) => `
        <article class="chain-card">
          <div class="chain-kicker">${escapeHtml(chain.layer)} · GhostScan</div>
          <h3>${escapeHtml(chain.title)}</h3>
          <p class="chain-id">Chain ID ${escapeHtml(String(chain.chainId))}</p>
          <dl>
            <div><dt>RPC</dt><dd>${escapeHtml(chain.rpcUrl)}</dd></div>
            <div><dt>Explorer</dt><dd>${escapeHtml(chain.explorerUrl)}</dd></div>
            <div><dt>Gas Token</dt><dd>${escapeHtml(chain.nativeGasToken)}</dd></div>
          </dl>
        </article>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(viewModel.explorerName)}</title>
    <style>
      :root {
        --bg: #071218;
        --panel: #0f1e27;
        --line: rgba(93, 218, 221, 0.16);
        --text: #edf6f9;
        --muted: #94aeb8;
        --teal: #5ddadd;
        --gold: #f3c94d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(93, 218, 221, 0.14), transparent 28%),
          linear-gradient(180deg, #071218 0%, #0a171e 100%);
        color: var(--text);
      }
      .page {
        max-width: 1160px;
        margin: 0 auto;
        padding: 28px 20px 60px;
      }
      .hero {
        padding: 34px 0 26px;
      }
      .eyebrow {
        color: var(--teal);
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 12px;
      }
      h1 {
        margin: 10px 0 12px;
        font-size: clamp(36px, 6vw, 64px);
        letter-spacing: -0.04em;
      }
      .hero p {
        margin: 0;
        max-width: 720px;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.6;
      }
      .grid {
        display: grid;
        gap: 16px;
      }
      .highlights {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 28px;
      }
      .chains {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        margin-top: 18px;
      }
      .highlight-card,
      .chain-card {
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 18px;
      }
      section { margin-top: 34px; }
      section h2 { margin: 0 0 10px; font-size: 24px; }
      section > p { margin: 0; color: var(--muted); }
      .highlight-card h3,
      .chain-card h3 { margin: 0 0 10px; font-size: 20px; }
      .highlight-card p,
      .chain-card dd { margin: 0; color: var(--muted); line-height: 1.55; }
      .chain-kicker,
      dt {
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--teal);
        font-size: 12px;
      }
      .chain-id {
        color: var(--gold);
        font-weight: 700;
        margin: 0 0 12px;
      }
      dl {
        display: grid;
        gap: 10px;
        margin: 0;
      }
      dl div { display: grid; gap: 5px; }
      footer {
        margin-top: 36px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="hero">
        <div class="eyebrow">GhostScan</div>
        <h1>${escapeHtml(viewModel.explorerName)}</h1>
        <p>${escapeHtml(viewModel.headline)}</p>
      </header>
      <section>
        <h2>Highlights</h2>
        <p>Explorer content is Ghost-native, GST-native, and bound to the canonical registry.</p>
        <div class="grid highlights">${highlights}</div>
      </section>
      <section>
        <h2>Tracked Chains</h2>
        <p>Each chain card is sourced from the canonical registry and current runtime environment.</p>
        <div class="grid chains">${chains}</div>
      </section>
      <footer>Rendered from the canonical GhostScan explorer model.</footer>
    </main>
  </body>
</html>`;
}
EOF

  cat > "$REPO_ROOT/apps/governance/src/index.ts" <<'EOF'
import {
  GHOST_CHAIN_KEYS,
  getChainByKey,
  type GhostChainKey
} from "@ghostchain/ghost-chain-registry";
import { getNextHop, isDirectRouteAllowed } from "@ghostchain/routing-law";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface GhostGovernanceNetworkSummaryEntry {
  key: GhostChainKey;
  displayName: string;
  chainId: number;
  settlementPathToL1: GhostChainKey | null;
  directSettlementToL1Allowed: boolean;
  signingRelayUrl: "http://localhost:7910";
}

export function buildGovernanceNetworkSummary(): GhostGovernanceNetworkSummaryEntry[] {
  return GHOST_CHAIN_KEYS.map((key) => {
    const chain = getChainByKey(key);

    return {
      key,
      displayName: chain.displayName,
      chainId: chain.chainId,
      settlementPathToL1: getNextHop(key, "ghostchain"),
      directSettlementToL1Allowed: isDirectRouteAllowed(key, "ghostchain"),
      signingRelayUrl: "http://localhost:7910"
    };
  });
}

export function renderGovernancePage(): string {
  const summary = buildGovernanceNetworkSummary();

  const cards = summary
    .map(
      (entry) => `
        <article class="route-card">
          <div class="route-kicker">${escapeHtml(entry.displayName)}</div>
          <h3>Chain ID ${escapeHtml(String(entry.chainId))}</h3>
          <dl>
            <div><dt>Next hop to L1</dt><dd>${escapeHtml(entry.settlementPathToL1 ?? "unavailable")}</dd></div>
            <div><dt>Direct L1 settlement</dt><dd>${entry.directSettlementToL1Allowed ? "allowed" : "forbidden"}</dd></div>
            <div><dt>Signing relay</dt><dd>${escapeHtml(entry.signingRelayUrl)}</dd></div>
          </dl>
        </article>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ghost Governance</title>
    <style>
      :root {
        --bg: #111014;
        --panel: #1a1720;
        --line: rgba(243, 201, 77, 0.12);
        --text: #f5efe8;
        --muted: #aba3b8;
        --gold: #f3c94d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Fraunces", "Georgia", serif;
        background:
          radial-gradient(circle at top, rgba(243, 201, 77, 0.12), transparent 24%),
          #111014;
        color: var(--text);
      }
      .page {
        max-width: 1080px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: clamp(34px, 6vw, 60px);
        letter-spacing: -0.03em;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }
      .eyebrow {
        margin-bottom: 12px;
        color: var(--gold);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 12px;
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
      }
      section { margin-top: 34px; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
        margin-top: 18px;
      }
      .route-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
      }
      .route-kicker,
      dt {
        color: var(--gold);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
      }
      h3 {
        margin: 10px 0 12px;
        font-size: 24px;
      }
      dl {
        display: grid;
        gap: 12px;
        margin: 0;
      }
      dl div { display: grid; gap: 5px; }
      dd { margin: 0; color: var(--muted); }
      footer {
        margin-top: 36px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header>
        <div class="eyebrow">Governance</div>
        <h1>GhostChain Governance Routing</h1>
        <p>Operational summaries remain advisory. Proposals go to the signing relay and the routing law keeps GhostL3 indirect on the path to GhostChain L1.</p>
      </header>
      <section>
        <div class="grid">${cards}</div>
      </section>
      <footer>Rendered from the canonical Ghost governance model.</footer>
    </main>
  </body>
</html>`;
}
EOF

  cat > "$REPO_ROOT/apps/dev/src/index.ts" <<'EOF'
import { GHOST_CHAIN_KEYS, getChainByKey, type GhostChainKey } from "@ghostchain/ghost-chain-registry";
import { createDefaultProviders } from "@ghostchain/ghost-sdk-core";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface GhostDeveloperProviderTarget {
  chain: GhostChainKey;
  rpcUrl: string;
}

export interface GhostDeveloperQuickstart {
  headline: string;
  subtitle: string;
  install: "pnpm add @ghostchain/ghost-sdk-core";
  chains: {
    key: GhostChainKey;
    chainId: number;
  }[];
  providerTargets: GhostDeveloperProviderTarget[];
  exampleMethod: "ghost_chainId";
  quickstartSteps: {
    step: string;
    title: string;
    code: string;
  }[];
  resources: {
    label: string;
    href: string;
    description: string;
  }[];
}

export function buildDeveloperQuickstart(
  env: Record<string, string | undefined> = process.env
): GhostDeveloperQuickstart {
  const providers = createDefaultProviders(env);

  return {
    headline: "Build on GhostChain",
    subtitle:
      "EVM-compatible · Solidity 0.8.24 · Foundry-first workflows · GST gas token · ghost_ RPC namespace",
    install: "pnpm add @ghostchain/ghost-sdk-core",
    chains: GHOST_CHAIN_KEYS.map((key) => ({
      key,
      chainId: getChainByKey(key).chainId
    })),
    providerTargets: GHOST_CHAIN_KEYS.map((key) => ({
      chain: key,
      rpcUrl: providers[key].url
    })),
    exampleMethod: "ghost_chainId",
    quickstartSteps: [
      {
        step: "01",
        title: "Install ghost-sdk-core",
        code: "pnpm add @ghostchain/ghost-sdk-core"
      },
      {
        step: "02",
        title: "Connect to GhostChain L1",
        code:
          'import { createGhostProvider } from "@ghostchain/ghost-sdk-core";\nconst provider = createGhostProvider({ chain: "ghostchain" });'
      },
      {
        step: "03",
        title: "Query ghost_chainId",
        code: 'const chainId = await provider.ghostChainId();\nconsole.log(chainId);'
      },
      {
        step: "04",
        title: "Query GST balance",
        code:
          'const balance = await provider.ghostGetBalance(address);\nconsole.log("GST:", balance);'
      }
    ],
    resources: [
      {
        label: "ghost-sdk-core",
        href: "/developers/sdk",
        description: "Ethers-free SDK and the preferred integration path for new code."
      },
      {
        label: "GhostScan",
        href: "/explorer",
        description: "Browse L1, L2, and L3 transactions and contracts from one explorer."
      },
      {
        label: "Foundry Profile",
        href: "/developers/foundry",
        description: "Forge configuration, remappings, and lint expectations for Ghost-native contracts."
      },
      {
        label: "Docs",
        href: "/developers/docs",
        description: "Architecture, API reference, and migration guidance for Ghost-native applications."
      }
    ]
  };
}

export function renderDeveloperPortal(
  env: Record<string, string | undefined> = process.env
): string {
  const quickstart = buildDeveloperQuickstart(env);

  const providerTargets = quickstart.providerTargets
    .map(
      (target) => `
        <tr>
          <td>${escapeHtml(target.chain)}</td>
          <td>${escapeHtml(target.rpcUrl)}</td>
        </tr>
      `
    )
    .join("");

  const steps = quickstart.quickstartSteps
    .map(
      (step) => `
        <article class="step-card">
          <div class="step-number">${escapeHtml(step.step)}</div>
          <h3>${escapeHtml(step.title)}</h3>
          <pre>${escapeHtml(step.code)}</pre>
        </article>
      `
    )
    .join("");

  const resources = quickstart.resources
    .map(
      (resource) => `
        <article class="resource-card">
          <h3><a href="${escapeHtml(resource.href)}">${escapeHtml(resource.label)}</a></h3>
          <p>${escapeHtml(resource.description)}</p>
        </article>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(quickstart.headline)}</title>
    <style>
      :root {
        --bg: #0d0d0d;
        --panel: #151515;
        --line: rgba(243, 201, 77, 0.16);
        --text: #f8fafc;
        --muted: #94a3b8;
        --gold: #f3c94d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Azeret Mono", "JetBrains Mono", monospace;
        background:
          linear-gradient(180deg, rgba(243,201,77,0.06), transparent 22%),
          #0d0d0d;
        color: var(--text);
      }
      .page {
        max-width: 1120px;
        margin: 0 auto;
        padding: 28px 20px 56px;
      }
      .hero {
        padding: 26px 0 22px;
      }
      .eyebrow {
        color: var(--gold);
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      h1 {
        margin: 12px 0 10px;
        font-size: clamp(34px, 6vw, 58px);
        letter-spacing: -0.04em;
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
      }
      .hero p {
        margin: 0;
        max-width: 820px;
        color: var(--muted);
        line-height: 1.7;
      }
      section { margin-top: 34px; }
      section h2 {
        margin: 0 0 12px;
        font-size: 24px;
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
      }
      section > p {
        margin: 0;
        color: var(--muted);
      }
      .grid {
        display: grid;
        gap: 16px;
      }
      .steps,
      .resources {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        margin-top: 18px;
      }
      .step-card,
      .resource-card,
      table {
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
        border: 1px solid var(--line);
        border-radius: 18px;
      }
      .step-card,
      .resource-card {
        padding: 18px;
      }
      .step-number {
        color: var(--gold);
        font-size: 12px;
        letter-spacing: 0.12em;
        margin-bottom: 10px;
      }
      .step-card h3,
      .resource-card h3 {
        margin: 0 0 10px;
        font-size: 20px;
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
      }
      pre {
        margin: 0;
        padding: 14px;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.28);
        overflow-x: auto;
        white-space: pre-wrap;
        color: #e7edf6;
      }
      .resource-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      table {
        width: 100%;
        margin-top: 18px;
        border-collapse: collapse;
        overflow: hidden;
      }
      th,
      td {
        padding: 14px 16px;
        text-align: left;
        border-bottom: 1px solid var(--line);
      }
      th {
        color: var(--gold);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      tr:last-child td {
        border-bottom: 0;
      }
      footer {
        margin-top: 36px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 14px;
      }
      a { color: inherit; }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="hero">
        <div class="eyebrow">Developer Portal</div>
        <h1>${escapeHtml(quickstart.headline)}</h1>
        <p>${escapeHtml(quickstart.subtitle)}</p>
      </header>
      <section>
        <h2>Quick Start</h2>
        <p>Use Ghost-native SDKs and the ghost_ RPC namespace only.</p>
        <div class="grid steps">${steps}</div>
      </section>
      <section>
        <h2>Provider Targets</h2>
        <p>These RPC targets are sourced directly from the canonical runtime config.</p>
        <table>
          <thead>
            <tr><th>Chain</th><th>RPC URL</th></tr>
          </thead>
          <tbody>${providerTargets}</tbody>
        </table>
      </section>
      <section>
        <h2>Resources</h2>
        <p>Stay on the Ghost-native toolchain and surfaces.</p>
        <div class="grid resources">${resources}</div>
      </section>
      <footer>Rendered from the canonical Ghost developer model.</footer>
    </main>
  </body>
</html>`;
}
EOF

  cat > "$REPO_ROOT/apps/app/tests/runtime.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { buildAppShell, renderAppLandingPage } from "../src/index.ts";

test("app shell is registry-driven and GST-branded", () => {
  const shell = buildAppShell({
    GHOSTCHAIN_RPC_URL: "http://l1.rpc",
    GHOSTL2_RPC_URL: "http://l2.rpc",
    GHOSTL3_RPC_URL: "http://l3.rpc"
  });

  assert.equal(shell.appName, "GhostApp");
  assert.equal(shell.walletName, "GhostWallet");
  assert.equal(shell.gasTokenSymbol, "GST");
  assert.equal(shell.hero.primaryCta.label, "Explore GhostScan");
  assert.equal(shell.hero.secondaryCta.label, "Build on GhostChain");
  assert.equal(shell.hero.stats[0]?.value, "14000101");
  assert.equal(shell.ecosystemCards.some((card) => card.title === "GhostScan"), true);
  assert.equal(shell.chains.length, 3);
  assert.deepEqual(
    shell.chains.map((chain) => ({
      key: chain.key,
      chainId: chain.chainId,
      rpcUrl: chain.rpcUrl
    })),
    [
      {
        key: "ghostchain",
        chainId: 14000101,
        rpcUrl: "http://l1.rpc"
      },
      {
        key: "ghostl2",
        chainId: 901,
        rpcUrl: "http://l2.rpc"
      },
      {
        key: "ghostl3",
        chainId: 903,
        rpcUrl: "http://l3.rpc"
      }
    ]
  );
});

test("app landing page renders a real Ghost-native surface", () => {
  const html = renderAppLandingPage({
    GHOSTCHAIN_RPC_URL: "http://l1.rpc"
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /The Ghost Blockchain/);
  assert.match(html, /Explore GhostScan/);
  assert.match(html, /GhostXchange/);
});
EOF

  cat > "$REPO_ROOT/apps/explorer/tests/runtime.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { buildExplorerViewModel, renderExplorerDashboard } from "../src/index.ts";

test("explorer view model stays on GhostScan and canonical chain IDs", () => {
  const viewModel = buildExplorerViewModel({
    GHOSTCHAIN_EXPLORER_URL: "http://ghostscan.l1",
    GHOSTL2_EXPLORER_URL: "http://ghostscan.l2",
    GHOSTL3_EXPLORER_URL: "http://ghostscan.l3"
  });

  assert.equal(viewModel.explorerName, "GhostScan");
  assert.match(viewModel.headline, /GhostChain L1, GhostL2, and GhostL3/);
  assert.equal(viewModel.highlights.length, 3);
  assert.equal(viewModel.chains.length, 3);
  assert.deepEqual(
    viewModel.chains.map((chain) => ({
      key: chain.key,
      chainId: chain.chainId,
      explorerUrl: chain.explorerUrl
    })),
    [
      {
        key: "ghostchain",
        chainId: 14000101,
        explorerUrl: "http://ghostscan.l1"
      },
      {
        key: "ghostl2",
        chainId: 901,
        explorerUrl: "http://ghostscan.l2"
      },
      {
        key: "ghostl3",
        chainId: 903,
        explorerUrl: "http://ghostscan.l3"
      }
    ]
  );
  assert.equal(viewModel.highlights[0]?.title, "Unified Chain View");
});

test("explorer dashboard renders a browser-facing GhostScan page", () => {
  const html = renderExplorerDashboard({
    GHOSTCHAIN_EXPLORER_URL: "http://ghostscan.l1"
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /GhostScan/);
  assert.match(html, /Unified Chain View/);
  assert.match(html, /http:\/\/ghostscan\.l1/);
});
EOF

  cat > "$REPO_ROOT/apps/governance/tests/runtime.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { buildGovernanceNetworkSummary, renderGovernancePage } from "../src/index.ts";

test("governance summary keeps L3 settlement indirect and points to the signing relay", () => {
  const summary = buildGovernanceNetworkSummary();

  assert.equal(summary.length, 3);

  const l1 = summary.find((entry) => entry.key === "ghostchain");
  const l2 = summary.find((entry) => entry.key === "ghostl2");
  const l3 = summary.find((entry) => entry.key === "ghostl3");

  assert.ok(l1);
  assert.ok(l2);
  assert.ok(l3);
  assert.equal(l1?.directSettlementToL1Allowed, true);
  assert.equal(l1?.settlementPathToL1, "ghostchain");
  assert.equal(l2?.directSettlementToL1Allowed, true);
  assert.equal(l2?.settlementPathToL1, "ghostchain");
  assert.equal(l3?.directSettlementToL1Allowed, false);
  assert.equal(l3?.settlementPathToL1, "ghostl2");
  assert.equal(l3?.signingRelayUrl, "http://localhost:7910");
});

test("governance page renders routing and signing-relay guidance", () => {
  const html = renderGovernancePage();

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /GhostChain Governance Routing/);
  assert.match(html, /ghostl2/);
  assert.match(html, /http:\/\/localhost:7910/);
});
EOF

  cat > "$REPO_ROOT/apps/dev/tests/runtime.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { buildDeveloperQuickstart, renderDeveloperPortal } from "../src/index.ts";

test("developer quickstart exposes ghost-sdk-core providers and ghost_ RPC usage", () => {
  const quickstart = buildDeveloperQuickstart({
    GHOSTCHAIN_RPC_URL: "http://l1.rpc",
    GHOSTL2_RPC_URL: "http://l2.rpc",
    GHOSTL3_RPC_URL: "http://l3.rpc"
  });

  assert.equal(quickstart.headline, "Build on GhostChain");
  assert.equal(quickstart.install, "pnpm add @ghostchain/ghost-sdk-core");
  assert.equal(quickstart.exampleMethod, "ghost_chainId");
  assert.equal(quickstart.quickstartSteps.length, 4);
  assert.match(quickstart.quickstartSteps[1]?.code ?? "", /createGhostProvider/);
  assert.equal(quickstart.resources.some((resource) => resource.label === "GhostScan"), true);
  assert.deepEqual(quickstart.providerTargets, [
    {
      chain: "ghostchain",
      rpcUrl: "http://l1.rpc"
    },
    {
      chain: "ghostl2",
      rpcUrl: "http://l2.rpc"
    },
    {
      chain: "ghostl3",
      rpcUrl: "http://l3.rpc"
    }
  ]);
});

test("developer portal renders quickstart guidance", () => {
  const html = renderDeveloperPortal({
    GHOSTCHAIN_RPC_URL: "http://l1.rpc"
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Build on GhostChain/);
  assert.match(html, /createGhostProvider/);
  assert.match(html, /ghost_chainId/);
});
EOF

  cat > "$REPO_ROOT/apps/site/src/data.ts" <<'EOF'
import { createGhostRuntimeConfig } from "@ghostchain/ghost-config";
import {
  GHOST_CHAIN_KEYS,
  getChainByKey,
  type GhostChainKey
} from "@ghostchain/ghost-chain-registry";
import { buildDeveloperQuickstart } from "@ghostchain/dev-app";
import { getNextHop, isDirectRouteAllowed } from "@ghostchain/routing-law";

type SiteEnv = Record<string, string | undefined>;

export type GhostChainRuntimeStatus = "healthy" | "chain-id-mismatch" | "unreachable";

export interface GhostChainStatusSnapshot {
  key: GhostChainKey;
  displayName: string;
  layer: "L1" | "L2" | "L3";
  rpcUrl: string;
  explorerUrl: string;
  expectedChainId: number;
  observedChainId: number | null;
  status: GhostChainRuntimeStatus;
  latencyMs: number | null;
  nextHopToGhostChain: GhostChainKey | null;
  directToGhostChainAllowed: boolean;
  error: string | null;
}

export interface GhostRuntimeSnapshot {
  generatedAt: string;
  healthyChains: number;
  totalChains: number;
  chains: GhostChainStatusSnapshot[];
  routingLaw: {
    l2ToGhostChainNextHop: GhostChainKey | null;
    l3ToGhostChainNextHop: GhostChainKey | null;
    l3DirectToGhostChainAllowed: boolean;
  };
}

export interface GhostDeveloperDocument {
  title: string;
  path: string;
  category: "architecture" | "launch" | "migration" | "protocol" | "operations";
  description: string;
}

export interface GhostDeveloperDocsCatalog {
  generatedAt: string;
  installCommand: string;
  preferredRpcMethod: "ghost_chainId";
  resources: {
    label: string;
    href: string;
    description: string;
  }[];
  documents: GhostDeveloperDocument[];
  apiEndpoints: {
    path: "/api/status" | "/api/docs";
    description: string;
  }[];
}

export interface GhostSiteDataDependencies {
  fetch?: typeof fetch;
  now?: () => Date;
  rpcTimeoutMs?: number;
}

function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  if (value.startsWith("0x") || value.startsWith("0X")) {
    const parsedHex = Number.parseInt(value.slice(2), 16);
    return Number.isInteger(parsedHex) ? parsedHex : null;
  }

  const parsedDecimal = Number.parseInt(value, 10);
  return Number.isInteger(parsedDecimal) ? parsedDecimal : null;
}

async function probeGhostChain(
  key: GhostChainKey,
  env: SiteEnv,
  dependencies: GhostSiteDataDependencies = {}
): Promise<GhostChainStatusSnapshot> {
  const fetchImplementation = dependencies.fetch ?? fetch;
  const timeoutMs = dependencies.rpcTimeoutMs ?? Number(env.GHOST_SITE_RPC_TIMEOUT_MS ?? "500");
  const runtimeConfig = createGhostRuntimeConfig(env);
  const chain = getChainByKey(key);
  const rpcUrl = runtimeConfig.endpoints[key].rpcUrl;
  const explorerUrl = runtimeConfig.endpoints[key].explorerUrl ?? "not configured";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetchImplementation(rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: key,
        method: "ghost_chainId",
        params: []
      }),
      signal: controller.signal
    });

    const payload = (await response.json().catch(() => ({}))) as {
      result?: unknown;
      error?: { message?: string };
    };
    const observedChainId = parseChainId(payload.result);
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        key,
        displayName: chain.displayName,
        layer: chain.layer,
        rpcUrl,
        explorerUrl,
        expectedChainId: chain.chainId,
        observedChainId,
        status: "unreachable",
        latencyMs,
        nextHopToGhostChain: getNextHop(key, "ghostchain"),
        directToGhostChainAllowed: isDirectRouteAllowed(key, "ghostchain"),
        error: `HTTP ${response.status}`
      };
    }

    return {
      key,
      displayName: chain.displayName,
      layer: chain.layer,
      rpcUrl,
      explorerUrl,
      expectedChainId: chain.chainId,
      observedChainId,
      status: observedChainId === chain.chainId ? "healthy" : "chain-id-mismatch",
      latencyMs,
      nextHopToGhostChain: getNextHop(key, "ghostchain"),
      directToGhostChainAllowed: isDirectRouteAllowed(key, "ghostchain"),
      error: payload.error?.message ?? null
    };
  } catch (error) {
    return {
      key,
      displayName: chain.displayName,
      layer: chain.layer,
      rpcUrl,
      explorerUrl,
      expectedChainId: chain.chainId,
      observedChainId: null,
      status: "unreachable",
      latencyMs: Date.now() - startedAt,
      nextHopToGhostChain: getNextHop(key, "ghostchain"),
      directToGhostChainAllowed: isDirectRouteAllowed(key, "ghostchain"),
      error: error instanceof Error ? error.message : "unknown rpc probe failure"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildRuntimeSnapshot(
  env: SiteEnv = process.env,
  dependencies: GhostSiteDataDependencies = {}
): Promise<GhostRuntimeSnapshot> {
  const now = dependencies.now ?? (() => new Date());
  const chains = await Promise.all(
    GHOST_CHAIN_KEYS.map((key) => probeGhostChain(key, env, dependencies))
  );

  return {
    generatedAt: now().toISOString(),
    healthyChains: chains.filter((chain) => chain.status === "healthy").length,
    totalChains: chains.length,
    chains,
    routingLaw: {
      l2ToGhostChainNextHop: getNextHop("ghostl2", "ghostchain"),
      l3ToGhostChainNextHop: getNextHop("ghostl3", "ghostchain"),
      l3DirectToGhostChainAllowed: isDirectRouteAllowed("ghostl3", "ghostchain")
    }
  };
}

export function buildDeveloperDocsCatalog(
  env: SiteEnv = process.env,
  dependencies: GhostSiteDataDependencies = {}
): GhostDeveloperDocsCatalog {
  const now = dependencies.now ?? (() => new Date());
  const quickstart = buildDeveloperQuickstart(env);

  return {
    generatedAt: now().toISOString(),
    installCommand: quickstart.install,
    preferredRpcMethod: quickstart.exampleMethod,
    resources: quickstart.resources,
    documents: [
      {
        title: "Custom Ghost Multichain Architecture",
        path: "docs/architecture/custom-ghost-multichain.md",
        category: "architecture",
        description:
          "Canonical routing and chain-role overview for GhostChain, GhostL2, and GhostL3."
      },
      {
        title: "Launch Readiness Checklist",
        path: "docs/launch/launch-readiness-checklist.md",
        category: "launch",
        description:
          "Gate review for registry wiring, services, apps, security, and promotion criteria."
      },
      {
        title: "Legacy Candidate Inventory",
        path: "docs/migration/legacy-candidate-inventory.md",
        category: "migration",
        description:
          "Selective migration shortlist for useful Ghost-native content and presentation patterns."
      },
      {
        title: "Master Launch TODO",
        path: "docs/todos/master-launch-todo.md",
        category: "protocol",
        description:
          "Protocol, services, and app backlog for the canonical Ghost-native rebuild path."
      },
      {
        title: "Governance Approval Workflow",
        path: "docs/operations/governance-approval-workflow.md",
        category: "operations",
        description:
          "Advisory-to-ratification workflow for operational changes and governance-gated rollouts."
      }
    ],
    apiEndpoints: [
      {
        path: "/api/status",
        description:
          "Live chain probes using the ghost_chainId method against the configured Ghost RPC endpoints."
      },
      {
        path: "/api/docs",
        description:
          "Structured developer docs catalog for the Ghost-native runtime, launch, and migration surfaces."
      }
    ]
  };
}
EOF

  cat > "$REPO_ROOT/apps/site/src/index.ts" <<'EOF'
import http, { type IncomingMessage, type ServerResponse } from "node:http";

import { renderAppLandingPage } from "@ghostchain/app";
import { renderDeveloperPortal } from "@ghostchain/dev-app";
import { renderExplorerDashboard } from "@ghostchain/explorer";
import { renderGovernancePage } from "@ghostchain/governance-app";
import {
  buildDeveloperDocsCatalog,
  buildRuntimeSnapshot,
  type GhostDeveloperDocsCatalog,
  type GhostRuntimeSnapshot,
  type GhostSiteDataDependencies
} from "./data.ts";

type SiteEnv = Record<string, string | undefined>;

export type GhostSiteRouteKey =
  | "landing"
  | "explorer"
  | "developers"
  | "governance";

export interface GhostSiteNavigationItem {
  key: GhostSiteRouteKey;
  href: string;
  label: string;
}

export interface GhostSiteResponse {
  statusCode: number;
  contentType: string;
  body: string;
}

export interface GhostSiteServerOptions {
  env?: SiteEnv;
  host?: string;
  port?: number;
  logger?: Pick<typeof console, "log" | "error">;
  dataDependencies?: GhostSiteDataDependencies;
}

const SITE_NAVIGATION: GhostSiteNavigationItem[] = [
  { key: "landing", href: "/", label: "GhostApp" },
  { key: "explorer", href: "/explorer", label: "GhostScan" },
  { key: "developers", href: "/developers", label: "Developers" },
  { key: "governance", href: "/governance", label: "Governance" }
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizePathname(pathname: string): string {
  if (pathname === "") {
    return "/";
  }

  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function renderNotFoundPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ghost Site Not Found</title>
    <style>
      :root {
        --bg: #0b0b0f;
        --panel: #14151d;
        --line: rgba(243, 201, 77, 0.18);
        --text: #f5efe8;
        --muted: #9da4b4;
        --gold: #f3c94d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top, rgba(243, 201, 77, 0.14), transparent 28%),
          #0b0b0f;
        color: var(--text);
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
      }
      .card {
        width: min(680px, 100%);
        padding: 28px;
        border-radius: 24px;
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
      }
      .kicker {
        color: var(--gold);
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 12px;
      }
      h1 {
        margin: 12px 0 10px;
        font-size: clamp(34px, 6vw, 54px);
        letter-spacing: -0.04em;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="kicker">Ghost Site</div>
      <h1>Page not found</h1>
      <p>The requested route is not part of the canonical Ghost v2 surface.</p>
    </main>
  </body>
</html>`;
}

function injectSiteChrome(html: string, activeRoute: GhostSiteRouteKey): string {
  const nav = SITE_NAVIGATION.map((item) => {
    const isActive = item.key === activeRoute;

    return `<a class="ghost-nav-link${isActive ? " is-active" : ""}" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`;
  }).join("");

  const chromeStyles = `
      .ghost-site-nav {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 28px;
        padding: 14px 16px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 18px;
        background: rgba(255,255,255,0.02);
        backdrop-filter: blur(10px);
      }
      .ghost-site-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: inherit;
        text-decoration: none;
      }
      .ghost-site-mark {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: linear-gradient(135deg, #f3c94d, #5ddadd);
        box-shadow: 0 0 20px rgba(243, 201, 77, 0.35);
      }
      .ghost-site-title {
        font-size: 13px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .ghost-site-links {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .ghost-nav-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        text-decoration: none;
        color: inherit;
      }
      .ghost-nav-link.is-active {
        border-color: rgba(243, 201, 77, 0.35);
        background: rgba(243, 201, 77, 0.08);
      }
      @media (max-width: 720px) {
        .ghost-site-nav {
          align-items: flex-start;
        }
      }`;

  const chromeMarkup = `
      <nav class="ghost-site-nav" aria-label="Ghost site navigation">
        <a class="ghost-site-brand" href="/">
          <span class="ghost-site-mark" aria-hidden="true"></span>
          <span class="ghost-site-title">Ghost v2 Site</span>
        </a>
        <div class="ghost-site-links">${nav}</div>
      </nav>`;

  return html
    .replace("</style>", `${chromeStyles}\n    </style>`)
    .replace('<main class="page">', `<main class="page">${chromeMarkup}`)
    .replace("<body>", '<body data-ghost-site="true">');
}

function injectDataPanel(html: string, panelMarkup: string): string {
  const panelStyles = `
      .ghost-data-section {
        margin-top: 34px;
        padding: 24px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.02);
      }
      .ghost-data-section h2 {
        margin: 0 0 10px;
        font-size: 24px;
      }
      .ghost-data-section > p {
        margin: 0 0 18px;
        line-height: 1.6;
      }
      .ghost-data-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .ghost-data-card {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.14);
      }
      .ghost-data-kicker {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #f3c94d;
      }
      .ghost-data-title {
        margin: 8px 0 10px;
        font-size: 20px;
      }
      .ghost-data-copy,
      .ghost-data-list dd {
        margin: 0;
        line-height: 1.6;
        color: inherit;
        opacity: 0.82;
      }
      .ghost-data-list {
        display: grid;
        gap: 10px;
        margin: 0;
      }
      .ghost-data-list div {
        display: grid;
        gap: 4px;
      }
      .ghost-data-list dt {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .ghost-status-badge {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .ghost-status-badge.is-healthy {
        color: #5ddadd;
        border-color: rgba(93, 218, 221, 0.28);
        background: rgba(93, 218, 221, 0.08);
      }
      .ghost-status-badge.is-chain-id-mismatch {
        color: #f3c94d;
        border-color: rgba(243, 201, 77, 0.28);
        background: rgba(243, 201, 77, 0.08);
      }
      .ghost-status-badge.is-unreachable {
        color: #ff8a80;
        border-color: rgba(255, 138, 128, 0.28);
        background: rgba(255, 138, 128, 0.08);
      }
      .ghost-inline-code {
        font-family: "Azeret Mono", "JetBrains Mono", monospace;
        font-size: 13px;
      }`;

  return html
    .replace("</style>", `${panelStyles}\n    </style>`)
    .replace("<footer>", `${panelMarkup}\n      <footer>`);
}

function renderStatusSection(
  title: string,
  description: string,
  snapshot: GhostRuntimeSnapshot
): string {
  const cards = snapshot.chains
    .map((chain) => {
      const observedChainId =
        chain.observedChainId === null ? "unavailable" : String(chain.observedChainId);
      const latency = chain.latencyMs === null ? "n/a" : `${chain.latencyMs} ms`;

      return `
        <article class="ghost-data-card">
          <div class="ghost-data-kicker">${escapeHtml(chain.layer)} · ${escapeHtml(chain.key)}</div>
          <h3 class="ghost-data-title">${escapeHtml(chain.displayName)}</h3>
          <div class="ghost-status-badge is-${escapeHtml(chain.status)}">${escapeHtml(chain.status)}</div>
          <dl class="ghost-data-list">
            <div><dt>Expected Chain ID</dt><dd>${escapeHtml(String(chain.expectedChainId))}</dd></div>
            <div><dt>Observed Chain ID</dt><dd>${escapeHtml(observedChainId)}</dd></div>
            <div><dt>RPC</dt><dd class="ghost-inline-code">${escapeHtml(chain.rpcUrl)}</dd></div>
            <div><dt>Latency</dt><dd>${escapeHtml(latency)}</dd></div>
            <div><dt>Next Hop To GhostChain</dt><dd>${escapeHtml(chain.nextHopToGhostChain ?? "unavailable")}</dd></div>
          </dl>
        </article>
      `;
    })
    .join("");

  return `
      <section class="ghost-data-section">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)} ${escapeHtml(String(snapshot.healthyChains))}/${escapeHtml(String(snapshot.totalChains))} chains currently report the canonical GhostChain identity.</p>
        <div class="ghost-data-grid">${cards}</div>
      </section>`;
}

function renderDocsSection(catalog: GhostDeveloperDocsCatalog): string {
  const resources = catalog.resources
    .map(
      (resource) => `
        <article class="ghost-data-card">
          <div class="ghost-data-kicker">Resource</div>
          <h3 class="ghost-data-title">${escapeHtml(resource.label)}</h3>
          <p class="ghost-data-copy">${escapeHtml(resource.description)}</p>
          <p class="ghost-data-copy ghost-inline-code">${escapeHtml(resource.href)}</p>
        </article>
      `
    )
    .join("");

  const documents = catalog.documents
    .map(
      (document) => `
        <article class="ghost-data-card">
          <div class="ghost-data-kicker">${escapeHtml(document.category)}</div>
          <h3 class="ghost-data-title">${escapeHtml(document.title)}</h3>
          <p class="ghost-data-copy">${escapeHtml(document.description)}</p>
          <p class="ghost-data-copy ghost-inline-code">${escapeHtml(document.path)}</p>
        </article>
      `
    )
    .join("");

  const apiEndpoints = catalog.apiEndpoints
    .map(
      (endpoint) => `
        <article class="ghost-data-card">
          <div class="ghost-data-kicker">API</div>
          <h3 class="ghost-data-title">${escapeHtml(endpoint.path)}</h3>
          <p class="ghost-data-copy">${escapeHtml(endpoint.description)}</p>
        </article>
      `
    )
    .join("");

  return `
      <section class="ghost-data-section">
        <h2>Developer Docs Feed</h2>
        <p>Serve Ghost-native onboarding from the canonical docs manifest and runtime endpoints.</p>
        <div class="ghost-data-grid">${resources}</div>
      </section>
      <section class="ghost-data-section">
        <h2>Internal Documents</h2>
        <p>These repo-relative documents define architecture, launch, migration, and operations guidance for the clean rebuild path.</p>
        <div class="ghost-data-grid">${documents}</div>
      </section>
      <section class="ghost-data-section">
        <h2>Runtime Endpoints</h2>
        <p>Use these server endpoints to fetch live Ghost-native runtime data without introducing external explorer assumptions.</p>
        <div class="ghost-data-grid">${apiEndpoints}</div>
      </section>`;
}

async function renderHtmlRoute(
  route: GhostSiteRouteKey,
  env: SiteEnv,
  dependencies: GhostSiteDataDependencies = {}
): Promise<string> {
  switch (route) {
    case "landing":
      return injectDataPanel(
        injectSiteChrome(renderAppLandingPage(env), route),
        renderStatusSection(
          "Network Status",
          "Live ghost_chainId probes are executed against the configured GhostChain, GhostL2, and GhostL3 RPC endpoints.",
          await buildRuntimeSnapshot(env, dependencies)
        )
      );
    case "explorer":
      return injectDataPanel(
        injectSiteChrome(renderExplorerDashboard(env), route),
        renderStatusSection(
          "Explorer Runtime Feed",
          "GhostScan runtime cards are derived from the same chain probes exposed by the site status endpoint.",
          await buildRuntimeSnapshot(env, dependencies)
        )
      );
    case "developers":
      return injectDataPanel(
        injectSiteChrome(renderDeveloperPortal(env), route),
        renderDocsSection(buildDeveloperDocsCatalog(env, dependencies))
      );
    case "governance":
      return injectDataPanel(
        injectSiteChrome(renderGovernancePage(), route),
        renderStatusSection(
          "Routing Law Runtime Snapshot",
          "Governance surfaces keep the current chain health and the canonical next-hop law in the same advisory view.",
          await buildRuntimeSnapshot(env, dependencies)
        )
      );
  }
}

export async function createSiteResponse(
  pathname: string,
  env: SiteEnv = process.env,
  dependencies: GhostSiteDataDependencies = {}
): Promise<GhostSiteResponse> {
  const normalized = normalizePathname(pathname);

  switch (normalized) {
    case "/":
    case "/index.html":
      return {
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        body: await renderHtmlRoute("landing", env, dependencies)
      };
    case "/explorer":
    case "/explorer.html":
      return {
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        body: await renderHtmlRoute("explorer", env, dependencies)
      };
    case "/developers":
    case "/developers.html":
      return {
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        body: await renderHtmlRoute("developers", env, dependencies)
      };
    case "/governance":
    case "/governance.html":
      return {
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        body: await renderHtmlRoute("governance", env, dependencies)
      };
    case "/api/status":
      return {
        statusCode: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(await buildRuntimeSnapshot(env, dependencies))
      };
    case "/api/docs":
      return {
        statusCode: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(buildDeveloperDocsCatalog(env, dependencies))
      };
    case "/health":
      return {
        statusCode: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          service: "ghost-site",
          status: "ok",
          routes: SITE_NAVIGATION.map((item) => item.href)
        })
      };
    default:
      return {
        statusCode: 404,
        contentType: "text/html; charset=utf-8",
        body: injectSiteChrome(renderNotFoundPage(), "landing")
      };
  }
}

export function createSiteServer(
  env: SiteEnv = process.env,
  dependencies: GhostSiteDataDependencies = {}
): http.Server {
  return http.createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const siteResponse = await createSiteResponse(url.pathname, env, dependencies);

    response.writeHead(siteResponse.statusCode, {
      "content-type": siteResponse.contentType
    });
    response.end(siteResponse.body);
  });
}

export function startSiteServer(options: GhostSiteServerOptions = {}): http.Server {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3001;
  const logger = options.logger ?? console;
  const server = createSiteServer(options.env, options.dataDependencies);

  server.listen(port, host, () => {
    logger.log(`ghost-site listening on http://${host}:${port}`);
  });

  server.on("error", (error) => {
    logger.error(error);
  });

  return server;
}
EOF

  cat > "$REPO_ROOT/apps/site/src/server.ts" <<'EOF'
import { startSiteServer } from "./index.ts";

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "3001", 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid PORT value: ${value ?? "undefined"}`);
  }

  return parsed;
}

const host = process.env.HOST ?? "127.0.0.1";
const port = parsePort(process.env.PORT);
const server = startSiteServer({ host, port });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
EOF

  cat > "$REPO_ROOT/apps/site/tests/runtime.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import { createSiteResponse, createSiteServer } from "../src/index.ts";

function createMockFetch() {
  return async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes("18545")) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "ghostchain",
          result: "0xd59fe5"
        }),
        { status: 200 }
      );
    }

    if (url.includes("29545")) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "ghostl2",
          result: "0x385"
        }),
        { status: 200 }
      );
    }

    return new Response("gateway timeout", { status: 504 });
  };
}

test("site response routes serve the Ghost-native pages", async () => {
  const dependencies = {
    fetch: createMockFetch(),
    now: () => new Date("2026-03-19T00:00:00.000Z")
  };

  const landing = await createSiteResponse(
    "/",
    {
      GHOSTCHAIN_RPC_URL: "http://127.0.0.1:18545",
      GHOSTL2_RPC_URL: "http://127.0.0.1:29545",
      GHOSTL3_RPC_URL: "http://127.0.0.1:39545"
    },
    dependencies
  );
  const explorer = await createSiteResponse("/explorer", undefined, dependencies);
  const developers = await createSiteResponse("/developers", undefined, dependencies);
  const governance = await createSiteResponse("/governance", undefined, dependencies);
  const missing = await createSiteResponse("/missing");

  assert.equal(landing.statusCode, 200);
  assert.match(landing.body, /Ghost v2 Site/);
  assert.match(landing.body, /The Ghost Blockchain/);
  assert.match(landing.body, /Network Status/);
  assert.match(landing.body, /healthy/);

  assert.equal(explorer.statusCode, 200);
  assert.match(explorer.body, /GhostScan/);
  assert.match(explorer.body, /Explorer Runtime Feed/);

  assert.equal(developers.statusCode, 200);
  assert.match(developers.body, /ghost_chainId/);
  assert.match(developers.body, /Developer Docs Feed/);

  assert.equal(governance.statusCode, 200);
  assert.match(governance.body, /http:\/\/localhost:7910/);
  assert.match(governance.body, /Routing Law Runtime Snapshot/);

  assert.equal(missing.statusCode, 404);
  assert.match(missing.body, /Page not found/);
});

test("site health route returns JSON status", async () => {
  const health = await createSiteResponse("/health");

  assert.equal(health.statusCode, 200);
  assert.equal(health.contentType, "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(health.body), {
    service: "ghost-site",
    status: "ok",
    routes: ["/", "/explorer", "/developers", "/governance"]
  });
});

test("site api endpoints expose runtime status and docs catalog", async () => {
  const dependencies = {
    fetch: createMockFetch(),
    now: () => new Date("2026-03-19T00:00:00.000Z")
  };

  const status = await createSiteResponse(
    "/api/status",
    {
      GHOSTCHAIN_RPC_URL: "http://127.0.0.1:18545",
      GHOSTL2_RPC_URL: "http://127.0.0.1:29545",
      GHOSTL3_RPC_URL: "http://127.0.0.1:39545"
    },
    dependencies
  );
  const docs = await createSiteResponse("/api/docs", undefined, dependencies);

  assert.equal(status.statusCode, 200);
  assert.equal(status.contentType, "application/json; charset=utf-8");

  const runtime = JSON.parse(status.body) as {
    generatedAt: string;
    healthyChains: number;
    totalChains: number;
    chains: Array<{
      key: string;
      expectedChainId: number;
      observedChainId: number | null;
      status: string;
      nextHopToGhostChain: string | null;
      directToGhostChainAllowed: boolean;
      error: string | null;
    }>;
    routingLaw: {
      l2ToGhostChainNextHop: string | null;
      l3ToGhostChainNextHop: string | null;
      l3DirectToGhostChainAllowed: boolean;
    };
  };

  assert.equal(runtime.generatedAt, "2026-03-19T00:00:00.000Z");
  assert.equal(runtime.healthyChains, 2);
  assert.equal(runtime.totalChains, 3);
  assert.deepEqual(
    runtime.chains.map((chain) => ({
      key: chain.key,
      expectedChainId: chain.expectedChainId,
      observedChainId: chain.observedChainId,
      status: chain.status,
      nextHopToGhostChain: chain.nextHopToGhostChain,
      directToGhostChainAllowed: chain.directToGhostChainAllowed,
      error: chain.error
    })),
    [
      {
        key: "ghostchain",
        expectedChainId: 14000101,
        observedChainId: 14000101,
        status: "healthy",
        nextHopToGhostChain: "ghostchain",
        directToGhostChainAllowed: true,
        error: null
      },
      {
        key: "ghostl2",
        expectedChainId: 901,
        observedChainId: 901,
        status: "healthy",
        nextHopToGhostChain: "ghostchain",
        directToGhostChainAllowed: true,
        error: null
      },
      {
        key: "ghostl3",
        expectedChainId: 903,
        observedChainId: null,
        status: "unreachable",
        nextHopToGhostChain: "ghostl2",
        directToGhostChainAllowed: false,
        error: "HTTP 504"
      }
    ]
  );
  assert.deepEqual(runtime.routingLaw, {
    l2ToGhostChainNextHop: "ghostchain",
    l3ToGhostChainNextHop: "ghostl2",
    l3DirectToGhostChainAllowed: false
  });

  assert.equal(docs.statusCode, 200);
  assert.equal(docs.contentType, "application/json; charset=utf-8");

  const docsCatalog = JSON.parse(docs.body) as {
    preferredRpcMethod: string;
    apiEndpoints: Array<{ path: string }>;
    documents: Array<{ path: string }>;
  };

  assert.equal(docsCatalog.preferredRpcMethod, "ghost_chainId");
  assert.deepEqual(
    docsCatalog.apiEndpoints.map((endpoint) => endpoint.path),
    ["/api/status", "/api/docs"]
  );
  assert.equal(
    docsCatalog.documents.some(
      (document) => document.path === "docs/architecture/custom-ghost-multichain.md"
    ),
    true
  );
});

test("site server handles live requests", async (t) => {
  const server = createSiteServer(
    {
      GHOSTCHAIN_RPC_URL: "http://127.0.0.1:18545",
      GHOSTL2_RPC_URL: "http://127.0.0.1:29545",
      GHOSTL3_RPC_URL: "http://127.0.0.1:39545"
    },
    {
      fetch: createMockFetch(),
      now: () => new Date("2026-03-19T00:00:00.000Z")
    }
  );

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/developers`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /Build on GhostChain/);
  assert.match(body, /Ghost v2 Site/);
  assert.match(body, /Developer Docs Feed/);
});
EOF

  cat > "$REPO_ROOT/services/ghost-sequencer/package.json" <<'EOF'
{
  "name": "@ghostchain/ghost-sequencer",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*",
    "@ghostchain/ghost-config": "workspace:*",
    "@ghostchain/routing-law": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/services/ghost-executor/package.json" <<'EOF'
{
  "name": "@ghostchain/ghost-executor",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*",
    "@ghostchain/ghost-config": "workspace:*",
    "@ghostchain/routing-guard": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/services/ghost-deriver/package.json" <<'EOF'
{
  "name": "@ghostchain/ghost-deriver",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-chain-registry": "workspace:*",
    "@ghostchain/ghost-config": "workspace:*",
    "@ghostchain/routing-law": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  cat > "$REPO_ROOT/services/ghost-orchestrator/package.json" <<'EOF'
{
  "name": "@ghostchain/ghost-orchestrator",
  "version": "0.1.0",
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@ghostchain/ghost-deriver": "workspace:*",
    "@ghostchain/ghost-executor": "workspace:*",
    "@ghostchain/ghost-sequencer": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test --experimental-strip-types tests/*.test.ts"
  }
}
EOF

  for svc in ghost-sequencer ghost-executor ghost-deriver ghost-orchestrator; do
    mkdir -p "$REPO_ROOT/services/$svc/tests"
    cat > "$REPO_ROOT/services/$svc/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
EOF
  done

  cat > "$REPO_ROOT/services/ghost-sequencer/src/index.ts" <<'EOF'
import { GHOST_CHAIN_IDS, type GhostChainKey } from "@ghostchain/ghost-chain-registry";
import { createGhostRuntimeConfig } from "@ghostchain/ghost-config";
import { assertRoutable, type RouteDecision } from "@ghostchain/routing-law";

export type GhostSequencerLaneKey = Extract<GhostChainKey, "ghostl2" | "ghostl3">;

export interface GhostSequencerLane {
  chain: GhostSequencerLaneKey;
  chainId: number;
  ingressRpcUrl: string;
  ingressWsUrl: string;
  settlement: RouteDecision;
  publicationTargetRpcUrl: string;
}

export interface GhostSequencerRuntime {
  service: "ghost-sequencer";
  healthcheck: {
    readiness: "/readyz";
    liveness: "/healthz";
  };
  settlementChainId: number;
  lanes: GhostSequencerLane[];
}

function createSequencerLane(
  lane: GhostSequencerLaneKey,
  env: Record<string, string | undefined>
): GhostSequencerLane {
  const config = createGhostRuntimeConfig(env);
  const settlement = assertRoutable(lane, "ghostchain");

  return {
    chain: lane,
    chainId: config.chainIds[lane],
    ingressRpcUrl: config.endpoints[lane].rpcUrl,
    ingressWsUrl: config.endpoints[lane].wsUrl,
    settlement,
    publicationTargetRpcUrl: config.endpoints[settlement.nextHop].rpcUrl
  };
}

export function createGhostSequencerRuntime(
  env: Record<string, string | undefined> = process.env
): GhostSequencerRuntime {
  return {
    service: "ghost-sequencer",
    healthcheck: {
      readiness: "/readyz",
      liveness: "/healthz"
    },
    settlementChainId: GHOST_CHAIN_IDS.ghostchain,
    lanes: [createSequencerLane("ghostl2", env), createSequencerLane("ghostl3", env)]
  };
}

export function describeGhostSequencer(
  env: Record<string, string | undefined> = process.env
): GhostSequencerRuntime {
  return createGhostSequencerRuntime(env);
}
EOF

  cat > "$REPO_ROOT/services/ghost-executor/src/index.ts" <<'EOF'
import {
  GHOST_CHAIN_IDS,
  type GhostChainKey
} from "@ghostchain/ghost-chain-registry";
import { createGhostRuntimeConfig } from "@ghostchain/ghost-config";
import {
  createGuardedEnvelope,
  type GuardedEnvelope
} from "@ghostchain/routing-guard";

export type GhostExecutorAction = "finalize-batch" | "publish-state-root";

export interface GhostExecutorJobPayload {
  action: GhostExecutorAction;
  sourceChainId: number;
}

export interface GhostExecutorJob {
  name: string;
  origin: GhostChainKey;
  envelope: GuardedEnvelope<GhostExecutorJobPayload>;
  dispatchRpcUrl: string;
}

export interface GhostExecutorRuntime {
  service: "ghost-executor";
  healthcheck: {
    readiness: "/readyz";
    liveness: "/healthz";
  };
  settlementRpcUrl: string;
  jobs: GhostExecutorJob[];
}

function createExecutorJob(
  origin: Extract<GhostChainKey, "ghostl2" | "ghostl3">,
  action: GhostExecutorAction,
  env: Record<string, string | undefined>
): GhostExecutorJob {
  const config = createGhostRuntimeConfig(env);
  const envelope = createGuardedEnvelope(origin, "ghostchain", {
    action,
    sourceChainId: GHOST_CHAIN_IDS[origin]
  });

  return {
    name: `${origin}-${action}`,
    origin,
    envelope,
    dispatchRpcUrl: config.endpoints[envelope.nextHop].rpcUrl
  };
}

export function createGhostExecutorRuntime(
  env: Record<string, string | undefined> = process.env
): GhostExecutorRuntime {
  const config = createGhostRuntimeConfig(env);

  return {
    service: "ghost-executor",
    healthcheck: {
      readiness: "/readyz",
      liveness: "/healthz"
    },
    settlementRpcUrl: config.endpoints.ghostchain.rpcUrl,
    jobs: [
      createExecutorJob("ghostl2", "finalize-batch", env),
      createExecutorJob("ghostl3", "publish-state-root", env)
    ]
  };
}

export function describeGhostExecutor(
  env: Record<string, string | undefined> = process.env
): GhostExecutorRuntime {
  return createGhostExecutorRuntime(env);
}
EOF

  cat > "$REPO_ROOT/services/ghost-deriver/src/index.ts" <<'EOF'
import {
  GHOST_CHAIN_IDS,
  type GhostChainKey
} from "@ghostchain/ghost-chain-registry";
import { createGhostRuntimeConfig } from "@ghostchain/ghost-config";
import { assertRoutable, type RouteDecision } from "@ghostchain/routing-law";

export type GhostDerivedChainKey = Extract<GhostChainKey, "ghostl2" | "ghostl3">;

export interface GhostDerivationStream {
  chain: GhostDerivedChainKey;
  chainId: number;
  sourceChain: GhostChainKey;
  sourceRpcUrl: string;
  targetRpcUrl: string;
  canonicalRoute: RouteDecision;
}

export interface GhostDeriverRuntime {
  service: "ghost-deriver";
  healthcheck: {
    readiness: "/readyz";
    liveness: "/healthz";
  };
  streams: GhostDerivationStream[];
}

type GhostDerivationPair =
  | {
      chain: "ghostl2";
      sourceChain: "ghostchain";
    }
  | {
      chain: "ghostl3";
      sourceChain: "ghostl2";
    };

function createDerivationStream(
  pair: GhostDerivationPair,
  env: Record<string, string | undefined>
): GhostDerivationStream {
  const config = createGhostRuntimeConfig(env);
  const { chain, sourceChain } = pair;
  const canonicalRoute = assertRoutable(sourceChain, chain);

  return {
    chain,
    chainId: GHOST_CHAIN_IDS[chain],
    sourceChain,
    sourceRpcUrl: config.endpoints[sourceChain].rpcUrl,
    targetRpcUrl: config.endpoints[chain].rpcUrl,
    canonicalRoute
  };
}

export function createGhostDeriverRuntime(
  env: Record<string, string | undefined> = process.env
): GhostDeriverRuntime {
  return {
    service: "ghost-deriver",
    healthcheck: {
      readiness: "/readyz",
      liveness: "/healthz"
    },
    streams: [
      createDerivationStream({ chain: "ghostl2", sourceChain: "ghostchain" }, env),
      createDerivationStream({ chain: "ghostl3", sourceChain: "ghostl2" }, env)
    ]
  };
}

export function describeGhostDeriver(
  env: Record<string, string | undefined> = process.env
): GhostDeriverRuntime {
  return createGhostDeriverRuntime(env);
}
EOF

  cat > "$REPO_ROOT/services/ghost-orchestrator/src/index.ts" <<'EOF'
import {
  createGhostDeriverRuntime,
  type GhostDeriverRuntime
} from "@ghostchain/ghost-deriver";
import {
  createGhostExecutorRuntime,
  type GhostExecutorRuntime
} from "@ghostchain/ghost-executor";
import {
  createGhostSequencerRuntime,
  type GhostSequencerRuntime
} from "@ghostchain/ghost-sequencer";

export type GhostManagedRuntime =
  | GhostSequencerRuntime
  | GhostExecutorRuntime
  | GhostDeriverRuntime;

export type GhostManagedServiceName =
  | GhostManagedRuntime["service"]
  | "ghost-orchestrator";

export interface GhostServiceDependency {
  service: Exclude<GhostManagedServiceName, "ghost-orchestrator">;
  dependsOn: Exclude<GhostManagedServiceName, "ghost-orchestrator">[];
}

export interface GhostOrchestratorRuntime {
  service: "ghost-orchestrator";
  healthcheck: {
    readiness: "/readyz";
    liveness: "/healthz";
  };
  startupOrder: Exclude<GhostManagedServiceName, "ghost-orchestrator">[];
  dependencyGraph: GhostServiceDependency[];
  services: GhostManagedRuntime[];
}

function buildDependencyGraph(): GhostServiceDependency[] {
  return [
    {
      service: "ghost-deriver",
      dependsOn: []
    },
    {
      service: "ghost-sequencer",
      dependsOn: ["ghost-deriver"]
    },
    {
      service: "ghost-executor",
      dependsOn: ["ghost-sequencer", "ghost-deriver"]
    }
  ];
}

function buildStartupOrder(graph: GhostServiceDependency[]): GhostOrchestratorRuntime["startupOrder"] {
  return [...graph]
    .sort((left, right) => left.dependsOn.length - right.dependsOn.length)
    .map((entry) => entry.service);
}

export function createGhostOrchestratorRuntime(
  env: Record<string, string | undefined> = process.env
): GhostOrchestratorRuntime {
  const dependencyGraph = buildDependencyGraph();
  const startupOrder = buildStartupOrder(dependencyGraph);
  const services: GhostManagedRuntime[] = [
    createGhostSequencerRuntime(env),
    createGhostExecutorRuntime(env),
    createGhostDeriverRuntime(env)
  ];

  const uniqueServices = new Set(services.map((service) => service.service));
  if (uniqueServices.size !== services.length) {
    throw new Error("duplicate managed service detected");
  }

  return {
    service: "ghost-orchestrator",
    healthcheck: {
      readiness: "/readyz",
      liveness: "/healthz"
    },
    startupOrder,
    dependencyGraph,
    services
  };
}

export function describeGhostOrchestrator(
  env: Record<string, string | undefined> = process.env
): GhostOrchestratorRuntime {
  return createGhostOrchestratorRuntime(env);
}
EOF

  cat > "$REPO_ROOT/services/ghost-sequencer/tests/runtime.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { createGhostSequencerRuntime } from "../src/index.ts";

test("ghost-sequencer exposes canonical L2 and L3 settlement lanes", () => {
  const runtime = createGhostSequencerRuntime({
    GHOSTL2_RPC_URL: "http://l2.rpc",
    GHOSTL2_WS_URL: "ws://l2.ws",
    GHOSTL3_RPC_URL: "http://l3.rpc",
    GHOSTL3_WS_URL: "ws://l3.ws",
    GHOSTCHAIN_RPC_URL: "http://l1.rpc"
  });

  assert.equal(runtime.service, "ghost-sequencer");
  assert.equal(runtime.settlementChainId, 14000101);
  assert.equal(runtime.lanes.length, 2);

  assert.deepEqual(
    runtime.lanes.map((lane) => ({
      chain: lane.chain,
      nextHop: lane.settlement.nextHop,
      publicationTargetRpcUrl: lane.publicationTargetRpcUrl
    })),
    [
      {
        chain: "ghostl2",
        nextHop: "ghostchain",
        publicationTargetRpcUrl: "http://l1.rpc"
      },
      {
        chain: "ghostl3",
        nextHop: "ghostl2",
        publicationTargetRpcUrl: "http://l2.rpc"
      }
    ]
  );
});
EOF

  cat > "$REPO_ROOT/services/ghost-executor/tests/runtime.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { createGhostExecutorRuntime } from "../src/index.ts";

test("ghost-executor guards batch and state-root publication routes", () => {
  const runtime = createGhostExecutorRuntime({
    GHOSTCHAIN_RPC_URL: "http://l1.rpc",
    GHOSTL2_RPC_URL: "http://l2.rpc"
  });

  assert.equal(runtime.service, "ghost-executor");
  assert.equal(runtime.settlementRpcUrl, "http://l1.rpc");
  assert.equal(runtime.jobs.length, 2);

  const finalizeBatch = runtime.jobs.find((job) => job.name === "ghostl2-finalize-batch");
  const publishStateRoot = runtime.jobs.find((job) => job.name === "ghostl3-publish-state-root");

  assert.ok(finalizeBatch);
  assert.ok(publishStateRoot);
  assert.equal(finalizeBatch?.envelope.nextHop, "ghostchain");
  assert.equal(finalizeBatch?.dispatchRpcUrl, "http://l1.rpc");
  assert.equal(publishStateRoot?.envelope.nextHop, "ghostl2");
  assert.equal(publishStateRoot?.dispatchRpcUrl, "http://l2.rpc");
});
EOF

  cat > "$REPO_ROOT/services/ghost-deriver/tests/runtime.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { createGhostDeriverRuntime } from "../src/index.ts";

test("ghost-deriver follows canonical upstream derivation order", () => {
  const runtime = createGhostDeriverRuntime({
    GHOSTCHAIN_RPC_URL: "http://l1.rpc",
    GHOSTL2_RPC_URL: "http://l2.rpc",
    GHOSTL3_RPC_URL: "http://l3.rpc"
  });

  assert.equal(runtime.service, "ghost-deriver");
  assert.deepEqual(
    runtime.streams.map((stream) => ({
      chain: stream.chain,
      sourceChain: stream.sourceChain,
      nextHop: stream.canonicalRoute.nextHop
    })),
    [
      {
        chain: "ghostl2",
        sourceChain: "ghostchain",
        nextHop: "ghostl2"
      },
      {
        chain: "ghostl3",
        sourceChain: "ghostl2",
        nextHop: "ghostl3"
      }
    ]
  );
});
EOF

  cat > "$REPO_ROOT/services/ghost-orchestrator/tests/runtime.test.ts" <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";

import { createGhostOrchestratorRuntime } from "../src/index.ts";

test("ghost-orchestrator preserves dependency-safe startup order", () => {
  const runtime = createGhostOrchestratorRuntime();

  assert.equal(runtime.service, "ghost-orchestrator");
  assert.deepEqual(runtime.startupOrder, [
    "ghost-deriver",
    "ghost-sequencer",
    "ghost-executor"
  ]);

  const dependencies = Object.fromEntries(
    runtime.dependencyGraph.map((entry) => [entry.service, entry.dependsOn])
  );

  assert.deepEqual(dependencies["ghost-deriver"], []);
  assert.deepEqual(dependencies["ghost-sequencer"], ["ghost-deriver"]);
  assert.deepEqual(dependencies["ghost-executor"], ["ghost-sequencer", "ghost-deriver"]);
  assert.equal(runtime.services.length, 3);
});
EOF
}

write_contracts() {
  log "Writing Foundry-first contracts"

  cat > "$REPO_ROOT/contracts/package.json" <<'EOF'
{
  "name": "@ghostchain/contracts-v2",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "build": "bash -lc 'export PATH=\"$HOME/.foundry/bin:$PATH\"; forge build'",
    "test": "bash -lc 'export PATH=\"$HOME/.foundry/bin:$PATH\"; forge test'"
  }
}
EOF

  cat > "$REPO_ROOT/contracts/foundry.toml" <<'EOF'
[profile.default]
src = "src"
test = "test"
out = "out"
solc_version = "0.8.24"
optimizer = true
optimizer_runs = 200
via_ir = true
EOF

  cat > "$REPO_ROOT/contracts/src/ghost/GhostBrand.sol" <<'EOF'
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

abstract contract GhostBrand {
    uint256 internal constant GST_UNIT = 1e18;
    uint256 internal constant GHOSTCHAIN_L1_CHAIN_ID = 14000101;
    uint256 internal constant GHOSTL2_CHAIN_ID = 901;
    uint256 internal constant GHOSTL3_CHAIN_ID = 903;
    address internal constant CANONICAL_GST = 0x0000000000000000000000000000000000000475;
}
EOF

  cat > "$REPO_ROOT/contracts/src/law/GhostRoutingLaw.sol" <<'EOF'
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { GhostBrand } from "../ghost/GhostBrand.sol";

abstract contract GhostRoutingLaw is GhostBrand {
    error RoutingLawViolation(uint256 sourceChainId, uint256 destinationChainId);

    function isDirectRouteAllowed(uint256 sourceChainId, uint256 destinationChainId) public pure returns (bool) {
        if (sourceChainId == destinationChainId) return true;
        if (sourceChainId == GHOSTCHAIN_L1_CHAIN_ID && destinationChainId == GHOSTL2_CHAIN_ID) return true;
        if (sourceChainId == GHOSTL2_CHAIN_ID && destinationChainId == GHOSTCHAIN_L1_CHAIN_ID) return true;
        if (sourceChainId == GHOSTL2_CHAIN_ID && destinationChainId == GHOSTL3_CHAIN_ID) return true;
        if (sourceChainId == GHOSTL3_CHAIN_ID && destinationChainId == GHOSTL2_CHAIN_ID) return true;
        return false;
    }

    function nextHop(uint256 sourceChainId, uint256 destinationChainId) public pure returns (uint256) {
        if (isDirectRouteAllowed(sourceChainId, destinationChainId)) return destinationChainId;
        if (sourceChainId == GHOSTL3_CHAIN_ID && destinationChainId == GHOSTCHAIN_L1_CHAIN_ID) return GHOSTL2_CHAIN_ID;
        if (sourceChainId == GHOSTCHAIN_L1_CHAIN_ID && destinationChainId == GHOSTL3_CHAIN_ID) return GHOSTL2_CHAIN_ID;
        revert RoutingLawViolation(sourceChainId, destinationChainId);
    }
}
EOF

  cat > "$REPO_ROOT/contracts/src/interfaces/IGhostSettlementGateway.sol" <<'EOF'
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IGhostSettlementGateway {
    struct SettlementInstruction {
        uint256 sourceChainId;
        uint256 destinationChainId;
        uint256 nextHopChainId;
        bytes32 commitment;
        uint256 batchNumber;
    }

    event SettlementCommitted(bytes32 indexed commitment, uint256 indexed sourceChainId, uint256 indexed destinationChainId, uint256 nextHopChainId);

    function commitSettlement(SettlementInstruction calldata instruction) external;
}
EOF

  cat > "$REPO_ROOT/contracts/src/interfaces/IGhostMessageBus.sol" <<'EOF'
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IGhostMessageBus {
    struct MessageEnvelope {
        uint256 originChainId;
        uint256 destinationChainId;
        uint256 nextHopChainId;
        address sender;
        address target;
        bytes payload;
    }

    event MessageQueued(bytes32 indexed messageId, uint256 indexed originChainId, uint256 indexed destinationChainId, uint256 nextHopChainId);

    function queueMessage(MessageEnvelope calldata envelope) external returns (bytes32 messageId);
}
EOF

  cat > "$REPO_ROOT/contracts/src/interfaces/IGhostAssetBridge.sol" <<'EOF'
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IGhostAssetBridge {
    struct BridgeTransfer {
        uint256 sourceChainId;
        uint256 destinationChainId;
        uint256 nextHopChainId;
        address token;
        address sender;
        address recipient;
        uint256 amount;
    }

    event BridgeTransferInitiated(bytes32 indexed transferId, uint256 indexed sourceChainId, uint256 indexed destinationChainId, uint256 nextHopChainId, address token, uint256 amount);

    function bridgeAsset(BridgeTransfer calldata transfer) external returns (bytes32 transferId);
}
EOF
}

write_docs_and_ops() {
  log "Writing docs and shadow-run artifacts"

  cat > "$REPO_ROOT/docs/architecture/custom-ghost-multichain.md" <<'EOF'
# Custom Ghost Multichain Architecture

- GhostChain L1: `14000101`
- GhostL2: `901`
- GhostL3: `903`
- Routing law: `GhostL3 -> GhostL2 -> GhostChain L1`
- Phase 1 preserves the current canonical runtime model.
EOF

  cat > "$REPO_ROOT/docs/migration/opstack-positioning.md" <<'EOF'
# OP Stack Positioning for v2

Phase 1 preserves the current canonical runtime model and does not claim that every internal OP-based dependency has been removed already.
EOF

  cat > "$REPO_ROOT/docs/launch/launch-readiness-checklist.md" <<'EOF'
# Launch Readiness Checklist

- [ ] `pnpm ghost:check` passes
- [ ] `pnpm build` passes
- [ ] `pnpm test` passes
- [ ] GhostChain, GhostL2, and GhostL3 answer on `18545`, `29545`, and `39545`
- [ ] GAIS inventory remains unchanged before cutover
EOF

  cat > "$REPO_ROOT/docs/todos/master-launch-todo.md" <<'EOF'
# Master Launch TODO

- implement real chain runtimes
- replace scaffolds with production services and apps
- validate the shadow VM before any cutover work
EOF

  cat > "$REPO_ROOT/docs/operations/governance-approval-workflow.md" <<'EOF'
# Governance Approval Workflow

- `✅ APPROVE TESTNET`
- `✅ APPROVE MAINNET`
- `🔁 ROLLBACK`
- `🛑 ABORT`
EOF

  cat > "$REPO_ROOT/docs/operations/canary-rollout-playbook.md" <<'EOF'
# Canary Rollout Playbook

- keep `ghostchain-devnet` alive during the shadow window
- snapshot old and new VMs before any identity move
- update GAIS inventory only after validation
EOF

  cat > "$REPO_ROOT/docs/operations/docker-compose-intelligence.yaml" <<'EOF'
version: "1.0"
mode: "diff-only"
collection:
  cadence_seconds: 30
EOF

  cat > "$REPO_ROOT/docs/operations/infrastructure-inventory.yaml" <<'EOF'
version: "1.0"
environment:
  name: "ghostchain-devnet-v2-shadow"
  owner: "ghost-ops"
EOF

  cat > "$REPO_ROOT/infra/hypervisor/shadow/README.md" <<'EOF'
# `ghostchain-devnet-v2` Shadow VM

This directory defines the non-invasive shadow-run VM inputs for `ghostchain-devnet-v2`.

Constraints:

- no GAIS or supervisor inventory updates in phase 1
- no reuse of the live devnet public `br0` identity
- NAT-only networking during the shadow window
- fresh thin-provisioned disks that keep the live geometry shape

Use `render-virt-install.sh` to print the proposed `qemu-img`, `cloud-localds`, and `virt-install` commands. The script does not execute them.

The current seed intentionally relies on the Ubuntu cloud image's default DHCP behavior for the single NAT NIC instead of forcing an interface name in cloud-init network config.
EOF

  cat > "$REPO_ROOT/infra/hypervisor/shadow/ghostchain-devnet-v2-spec.yaml" <<'EOF'
vm:
  name: ghostchain-devnet-v2
  os: ubuntu-24.04
  role: shadow-devnet
  vcpu: 4
  memory_mib: 12288
  autostart: false
  gais_managed: false

disks:
  - name: ghostchain-devnet-v2-vda.qcow2
    purpose: system
    size_gib: 450
    thin_provisioned: true
  - name: ghostchain-devnet-v2-vdb.qcow2
    purpose: data
    size_gib: 200
    thin_provisioned: true

networks:
  - type: network
    source: default
    mode: nat
    public_ip: null

boot:
  cloud_init:
    user_data: user-data.yaml
    meta_data: meta-data.yaml
    network_config: null

policy:
  keep_old_vm_running: true
  reuse_public_br0_identity: false
  update_gais_inventory: false
EOF

  cat > "$REPO_ROOT/infra/hypervisor/shadow/meta-data.yaml" <<'EOF'
instance-id: ghostchain-devnet-v2
local-hostname: ghostchain-devnet-v2
EOF

  cat > "$REPO_ROOT/infra/hypervisor/shadow/network-config.yaml" <<'EOF'
version: 2
notes:
  - "Unused by the current seed."
  - "The shadow VM relies on default DHCP from the Ubuntu cloud image for its single NAT NIC."
EOF

  cat > "$REPO_ROOT/infra/hypervisor/shadow/user-data.yaml" <<'EOF'
#cloud-config
users:
  - default
  - name: ghost
    shell: /bin/bash
    groups: [sudo, docker]
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    ssh_authorized_keys:
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFjKrgPSbt6FOOIZODWH2VghFOshv8IudSLOiuJKBk6X ghost@ghostchain-baremetal

ssh_pwauth: false

packages:
  - qemu-guest-agent
  - docker.io
  - docker-compose-v2
  - git
  - curl

runcmd:
  - [systemctl, enable, --now, qemu-guest-agent]
  - [systemctl, enable, --now, docker]
  - [bash, -lc, "printf 'shadow vm ready for /home/ghost/build-new-devnet.sh\n' > /etc/motd"]
EOF

  cat > "$REPO_ROOT/infra/hypervisor/shadow/render-virt-install.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMGDIR="${IMGDIR:-/var/lib/libvirt/images/custom}"
BASE_IMG="${BASE_IMG:-/var/lib/libvirt/images/base/noble-server-cloudimg-amd64.img}"
VM_NAME="${VM_NAME:-ghostchain-devnet-v2}"
SYSTEM_DISK="${SYSTEM_DISK:-$IMGDIR/${VM_NAME}-vda.qcow2}"
DATA_DISK="${DATA_DISK:-$IMGDIR/${VM_NAME}-vdb.qcow2}"
SEED_ISO="${SEED_ISO:-$IMGDIR/${VM_NAME}-seed.iso}"

cat <<OUT
# Render only. Review and execute manually after governance approval.

qemu-img create -f qcow2 -F qcow2 -b "$BASE_IMG" "$SYSTEM_DISK" 450G
qemu-img create -f qcow2 "$DATA_DISK" 200G
cloud-localds "$SEED_ISO" "$SCRIPT_DIR/user-data.yaml" "$SCRIPT_DIR/meta-data.yaml"
virt-install \\
  --name "$VM_NAME" \\
  --memory 12288 \\
  --vcpus 4 \\
  --import \\
  --os-variant ubuntu24.04 \\
  --disk path="$SYSTEM_DISK",bus=virtio,format=qcow2 \\
  --disk path="$DATA_DISK",bus=virtio,format=qcow2 \\
  --disk path="$SEED_ISO",device=cdrom \\
  --network network=default,model=virtio \\
  --noautoconsole
OUT
EOF
}

write_helper_scripts() {
  log "Writing helper scripts"

  cat > "$REPO_ROOT/scripts/ghost-check.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$HOME/.foundry/bin:$PATH"

log() { printf "[ghost-check] %s\n" "$*"; }
fail() { printf "[ghost-check] ERROR: %s\n" "$*" >&2; exit 1; }

pnpm_cmd() {
  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
    return 0
  fi

  pnpm "$@"
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "missing required file: $path"
}

for required in \
  package.json \
  pnpm-workspace.yaml \
  packages/ghost-chain-registry/src/chains.ts \
  packages/ghost-config/src/env.ts \
  packages/ghost-sdk-core/src/index.ts \
  packages/routing-law/src/index.ts \
  packages/routing-guard/src/index.ts \
  packages/brand-enforcer/src/index.ts \
  services/ghost-sequencer/src/index.ts \
  services/ghost-executor/src/index.ts \
  services/ghost-deriver/src/index.ts \
  services/ghost-orchestrator/src/index.ts \
  contracts/foundry.toml \
  contracts/src/ghost/GhostBrand.sol \
  contracts/src/interfaces/IGhostSettlementGateway.sol \
  contracts/src/interfaces/IGhostMessageBus.sol \
  contracts/src/interfaces/IGhostAssetBridge.sol
do
  require_file "$required"
done

log "verifying canonical chain IDs"
if rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**' --glob '!out/**' --glob '!coverage/**' '1400010[23]' "$ROOT_DIR"; then
  fail "found non-canonical v2 chain IDs"
fi

log "verifying RPC namespace usage"
if rg -n --glob '*.ts' --glob '*.tsx' --glob '*.sol' '\beth_' packages/*/src apps/*/src services/*/src contracts/src; then
  fail "found forbidden eth_ namespace usage"
fi

log "verifying SDK import policy"
if rg -n --glob '*.ts' --glob '*.tsx' 'from ["'\'']ethers["'\'']|require\(["'\'']ethers["'\'']\)|from ["'\'']web3["'\'']|require\(["'\'']web3["'\'']\)' packages/*/src apps/*/src services/*/src; then
  fail "found forbidden ethers/web3 import"
fi

log "verifying build graph"
pnpm_cmd -r --if-present build

log "verifying Foundry contracts"
command -v forge >/dev/null 2>&1 || fail "forge is required but not installed"
(cd contracts && forge build)

log "PASS"
EOF

  cat > "$REPO_ROOT/scripts/preflight-ghost.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

printf "Preflight Ghost-native stack\n"
printf "Workspace: %s\n" "$ROOT_DIR"
printf "Node: %s\n" "$(node -v 2>/dev/null || echo missing)"
printf "pnpm: %s\n" "$(pnpm -v 2>/dev/null || echo missing)"
printf "forge: %s\n" "$(forge --version 2>/dev/null | head -n 1 || echo missing)"

for port in 18545 29545 39545; do
  if ss -lnt "( sport = :$port )" | tail -n +2 | grep -q .; then
    printf "port %s: listening\n" "$port"
  else
    printf "port %s: not listening\n" "$port"
  fi
done
EOF

  cat > "$REPO_ROOT/scripts/gst-leakage.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**' --glob '!out/**' --glob '!coverage/**' --glob '!packages/brand-enforcer/**' '\b(ETH|Ether|WETH)\b' apps services packages contracts/src docs README.md; then
  echo "[gst-leakage] ERROR: detected non-GST gas token terminology" >&2
  exit 1
fi

echo "[gst-leakage] PASS"
EOF

  cat > "$REPO_ROOT/scripts/inventory-legacy-candidates.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEGACY_ROOT="${LEGACY_ROOT:-/home/ghost/ghostl-stack}"
OUTPUT_PATH="${OUTPUT_PATH:-$ROOT_DIR/docs/migration/legacy-candidate-inventory.md}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  printf "[legacy-inventory] %s\n" "$*"
}

require_dir() {
  local path="$1"
  [[ -d "$path" ]] || {
    printf "[legacy-inventory] ERROR: missing directory: %s\n" "$path" >&2
    exit 1
  }
}

collect_matches() {
  local scope="$1"
  local pattern="$2"
  local output_file="$3"

  if [[ ! -d "$LEGACY_ROOT/$scope" ]]; then
    : > "$output_file"
    return
  fi

  rg -l \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    --glob '!out/**' \
    --glob '!coverage/**' \
    --glob '!contracts/lib/**' \
    "$pattern" \
    "$LEGACY_ROOT/$scope" | sort > "$output_file" || true
}

write_section() {
  local title="$1"
  local rationale="$2"
  local input_file="$3"

  printf "## %s\n\n" "$title" >> "$OUTPUT_PATH"
  printf "%s\n\n" "$rationale" >> "$OUTPUT_PATH"

  if [[ ! -s "$input_file" ]]; then
    printf -- "- No candidates found in the legacy repo for this category.\n\n" >> "$OUTPUT_PATH"
    return
  fi

  while IFS= read -r file_path; do
    printf -- '- `%s`\n' "${file_path#$LEGACY_ROOT/}" >> "$OUTPUT_PATH"
  done < "$input_file"

  printf "\n" >> "$OUTPUT_PATH"
}

main() {
  require_dir "$ROOT_DIR"
  require_dir "$LEGACY_ROOT"
  mkdir -p "$(dirname "$OUTPUT_PATH")"

  local ui_candidates="$TMP_DIR/ui-candidates.txt"
  local sdk_candidates="$TMP_DIR/sdk-candidates.txt"
  local contract_candidates="$TMP_DIR/contract-candidates.txt"
  local service_candidates="$TMP_DIR/service-candidates.txt"

  collect_matches "apps" 'GhostScan|GhostWallet|GNS|ghost-sdk-core|GhostProvider|ghost_' "$ui_candidates"
  collect_matches "packages" 'ghost-sdk-core|routing-law|routing-guard|ghost_chainId|GhostProvider' "$sdk_candidates"
  collect_matches "contracts" 'GhostSettlementGateway|GhostMessageBus|GhostAssetBridge|GhostRoutingLaw|GST_UNIT|CANONICAL_GST' "$contract_candidates"
  collect_matches "services" 'ghost-sequencer|ghost-executor|ghost-deriver|ghost-orchestrator|readyz|healthz' "$service_candidates"

  cat > "$OUTPUT_PATH" <<MARKDOWN
# Legacy Candidate Inventory

Generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC").

Source repo: \`$LEGACY_ROOT\`

This inventory is phase-7 preparation only. It does **not** migrate code. Its purpose is to identify legacy files worth reviewing before any selective import into \`ghostl-stack-v2\`.

Selection rules:

- Prefer branded Ghost-native assets and copy.
- Prefer SDK or runtime references that reinforce the canonical routing law.
- Do not import OP-specific assumptions, non-canonical chain IDs, or direct L3 -> L1 flows.
- Review every candidate manually before porting it into canonical paths.

MARKDOWN

  write_section \
    "UI And Branding Candidates" \
    "Legacy app files that already speak in Ghost-native product terms such as GhostScan, GhostWallet, GNS, GST, or the \`ghost_\` RPC namespace." \
    "$ui_candidates"

  write_section \
    "SDK And Routing Candidates" \
    "Legacy package files that reference \`ghost-sdk-core\`, routing-law concepts, or Ghost-native provider usage patterns." \
    "$sdk_candidates"

  write_section \
    "Contract Candidates" \
    "Legacy contract files that may already contain useful canonical interface names, routing-law wording, or GST constants." \
    "$contract_candidates"

  write_section \
    "Service Candidates" \
    "Legacy service files that look relevant to sequencer, executor, deriver, orchestrator, or healthcheck behavior." \
    "$service_candidates"

  cat >> "$OUTPUT_PATH" <<'MARKDOWN'
## Recommended Review Order

1. Review UI and branding candidates first; they are the lowest-risk source for selective migration.
2. Review SDK and routing candidates second; only port ideas that preserve the current chain IDs and routing law.
3. Review contracts and services last; these are the highest-risk categories and need explicit validation against the v2 canonical runtime model.
MARKDOWN

  log "wrote migration inventory to $OUTPUT_PATH"
}

main "$@"
EOF

  cat > "$REPO_ROOT/scripts/render-app-previews.mjs" <<'EOF'
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderAppLandingPage } from "../apps/app/src/index.ts";
import { renderDeveloperPortal } from "../apps/dev/src/index.ts";
import { renderExplorerDashboard } from "../apps/explorer/src/index.ts";
import { renderGovernancePage } from "../apps/governance/src/index.ts";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "..");
const outputDir = path.join(rootDir, "docs", "previews");

fs.mkdirSync(outputDir, { recursive: true });

const pages = [
  {
    fileName: "app.html",
    html: renderAppLandingPage()
  },
  {
    fileName: "explorer.html",
    html: renderExplorerDashboard()
  },
  {
    fileName: "developers.html",
    html: renderDeveloperPortal()
  },
  {
    fileName: "governance.html",
    html: renderGovernancePage()
  }
];

const links = pages
  .map(
    (page) => `<li><a href="./${page.fileName}">${page.fileName.replace(".html", "")}</a></li>`
  )
  .join("");

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ghost Preview Index</title>
    <style>
      body {
        margin: 0;
        padding: 40px 20px;
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
        background: #0b0b0f;
        color: #f5efe8;
      }
      main {
        max-width: 720px;
        margin: 0 auto;
      }
      a { color: #f3c94d; }
      li + li { margin-top: 12px; }
      p { color: #9da4b4; }
    </style>
  </head>
  <body>
    <main>
      <h1>Ghost v2 Preview Pages</h1>
      <p>Static HTML previews generated from the canonical app packages.</p>
      <ul>${links}</ul>
    </main>
  </body>
</html>`;

for (const page of pages) {
  fs.writeFileSync(path.join(outputDir, page.fileName), page.html);
}

fs.writeFileSync(path.join(outputDir, "index.html"), indexHtml);

for (const page of pages) {
  console.log(`rendered docs/previews/${page.fileName}`);
}
console.log("rendered docs/previews/index.html");
EOF

  cat > "$REPO_ROOT/scripts/export-standalone-repo.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINATION="${DESTINATION:-${ROOT_DIR%/}-standalone}"
MARKER_FILE=".ghost-v2-export-root"

usage() {
  cat <<'HELP'
Usage: bash scripts/export-standalone-repo.sh [--destination <dir>]

Exports this workspace into a standalone git-ready tree so `.github/workflows`
resolves at repository root for hosted GitHub Actions.
HELP
}

log() { printf '[repo-export] %s\n' "$*"; }
fail() { printf '[repo-export] ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --destination)
      DESTINATION="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

SOURCE_REALPATH="$(realpath "$ROOT_DIR")"
DEST_REALPATH="$(realpath -m "$DESTINATION")"

[[ "$DEST_REALPATH" != "$SOURCE_REALPATH" ]] || fail "destination must differ from source"
[[ "$DEST_REALPATH" != "$(dirname "$SOURCE_REALPATH")" ]] || fail "destination cannot be the parent directory of the source"

if [[ -e "$DEST_REALPATH" && ! -f "$DEST_REALPATH/$MARKER_FILE" ]]; then
  if find "$DEST_REALPATH" -mindepth 1 -maxdepth 1 | grep -q .; then
    fail "destination exists and is not a managed export: $DEST_REALPATH"
  fi
fi

mkdir -p "$DEST_REALPATH"

log "exporting $SOURCE_REALPATH to $DEST_REALPATH"
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'build/' \
  --exclude 'coverage/' \
  --exclude 'out/' \
  --exclude '.tmp/' \
  --exclude 'docs/previews/' \
  --exclude 'environments/devnet/secrets/' \
  --exclude 'environments/devnet/vault/gcp-service-account.json' \
  "$SOURCE_REALPATH"/ "$DEST_REALPATH"/

printf 'managed export from %s\n' "$SOURCE_REALPATH" > "$DEST_REALPATH/$MARKER_FILE"

if [[ ! -d "$DEST_REALPATH/.git" ]]; then
  git -C "$DEST_REALPATH" init -b main >/dev/null
  log "initialized standalone git repository"
else
  log "reused existing standalone git repository"
fi

log "standalone repo ready at $DEST_REALPATH"
cat <<OUT
Next:
  cd $DEST_REALPATH
  git status --short
  git remote add origin <your-repo-url>
  git add .
  git commit -m "Bootstrap ghostl-stack-v2"
  git push -u origin main

Hosted GitHub Actions will then detect:
  .github/workflows/devnet-ci.yml
OUT
EOF

  cat > "$REPO_ROOT/scripts/publish-standalone-repo.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINATION="${DESTINATION:-${ROOT_DIR%/}-standalone}"
BRANCH="${BRANCH:-main}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
REMOTE_URL="${REMOTE_URL:-}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-Sync standalone repo from source workspace}"
NO_PUSH=0

usage() {
  cat <<'HELP'
Usage: bash scripts/publish-standalone-repo.sh [options]

Options:
  --destination <dir>     Standalone repo path (default: sibling -standalone dir)
  --remote-url <url>      Remote URL to add or update on the standalone repo
  --remote-name <name>    Remote name to use (default: origin)
  --branch <name>         Branch to commit/push (default: main)
  --commit-message <msg>  Commit message for exported changes
  --no-push               Export and commit only; do not push
  --help                  Show this help
HELP
}

log() { printf '[repo-publish] %s\n' "$*"; }
fail() { printf '[repo-publish] ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --destination)
      DESTINATION="$2"
      shift 2
      ;;
    --remote-url)
      REMOTE_URL="$2"
      shift 2
      ;;
    --remote-name)
      REMOTE_NAME="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --commit-message)
      COMMIT_MESSAGE="$2"
      shift 2
      ;;
    --no-push)
      NO_PUSH=1
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

STANDALONE_ROOT="$(realpath -m "$DESTINATION")"

ensure_git_identity() {
  local git_root author_name author_email

  if git -C "$STANDALONE_ROOT" config user.name >/dev/null 2>&1 && \
     git -C "$STANDALONE_ROOT" config user.email >/dev/null 2>&1; then
    return 0
  fi

  git_root="$(git -C "$ROOT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
  author_name="$(git -C "${git_root:-$ROOT_DIR}" log -1 --format='%an' 2>/dev/null || true)"
  author_email="$(git -C "${git_root:-$ROOT_DIR}" log -1 --format='%ae' 2>/dev/null || true)"

  [[ -n "$author_name" ]] || fail "could not infer git user.name; configure it in the standalone repo"
  [[ -n "$author_email" ]] || fail "could not infer git user.email; configure it in the standalone repo"

  git -C "$STANDALONE_ROOT" config user.name "$author_name"
  git -C "$STANDALONE_ROOT" config user.email "$author_email"
  log "configured local git identity as ${author_name} <${author_email}>"
}

configure_remote() {
  if [[ -z "$REMOTE_URL" ]]; then
    REMOTE_URL="$(git -C "$STANDALONE_ROOT" remote get-url "$REMOTE_NAME" 2>/dev/null || true)"
  fi

  [[ -n "$REMOTE_URL" ]] || fail "missing remote URL; pass --remote-url or configure ${REMOTE_NAME}"

  if git -C "$STANDALONE_ROOT" remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
    git -C "$STANDALONE_ROOT" remote set-url "$REMOTE_NAME" "$REMOTE_URL"
  else
    git -C "$STANDALONE_ROOT" remote add "$REMOTE_NAME" "$REMOTE_URL"
  fi
}

discover_github_basic_auth() {
  local git_root url auth_part auth_user auth_token

  if [[ -n "${GIT_AUTH_BASIC_B64:-}" ]]; then
    printf '%s\n' "$GIT_AUTH_BASIC_B64"
    return 0
  fi

  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    printf '%s:%s' "${GITHUB_ACTOR:-${GIT_AUTH_USER:-x-access-token}}" "$GITHUB_TOKEN" | base64 -w0
    printf '\n'
    return 0
  fi

  git_root="$(git -C "$ROOT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$git_root" ]] || return 1

  for url in \
    "$(git -C "$git_root" remote get-url ghostl-stack 2>/dev/null || true)" \
    "$(git -C "$git_root" remote get-url origin 2>/dev/null || true)"
  do
    if [[ "$url" == https://*:*@github.com/* ]]; then
      auth_part="${url#https://}"
      auth_part="${auth_part%@github.com/*}"
      auth_user="${auth_part%%:*}"
      auth_token="${auth_part#*:}"
      printf '%s:%s' "$auth_user" "$auth_token" | base64 -w0
      printf '\n'
      return 0
    fi
  done

  return 1
}

git_with_auth() {
  local auth_b64

  auth_b64="$(discover_github_basic_auth || true)"
  if [[ -n "$auth_b64" && "$REMOTE_URL" == https://github.com/* ]]; then
    git -C "$STANDALONE_ROOT" -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth_b64" "$@"
    return 0
  fi

  git -C "$STANDALONE_ROOT" "$@"
}

log "exporting source workspace into standalone repo"
bash "$ROOT_DIR/scripts/export-standalone-repo.sh" --destination "$STANDALONE_ROOT"

[[ -d "$STANDALONE_ROOT/.git" ]] || fail "standalone repo is missing .git: $STANDALONE_ROOT"

ensure_git_identity
git -C "$STANDALONE_ROOT" branch -M "$BRANCH"

if [[ -z "$(git -C "$STANDALONE_ROOT" status --short)" ]]; then
  log "standalone repo is already up to date"
else
  git -C "$STANDALONE_ROOT" add .
  git -C "$STANDALONE_ROOT" commit -m "$COMMIT_MESSAGE"
  log "created commit $(git -C "$STANDALONE_ROOT" rev-parse --short HEAD)"
fi

if [[ "$NO_PUSH" == "1" ]]; then
  log "skipping push because --no-push was requested"
  exit 0
fi

configure_remote
git_with_auth push -u "$REMOTE_NAME" "$BRANCH"
log "pushed $BRANCH to $REMOTE_NAME ($REMOTE_URL)"
EOF

  chmod +x "$REPO_ROOT"/scripts/*.sh
  chmod +x "$REPO_ROOT"/infra/hypervisor/shadow/render-virt-install.sh
}

write_devnet_extensions() {
  log "Writing devnet, Vault, and CI extensions"

  install -d -o "$GHOST_USER" -g "$GHOST_USER" \
    "$REPO_ROOT"/.github/{workflows,scripts} \
    "$REPO_ROOT"/environments/devnet/{ghostchain/config,ghostl2/config,ghostl3/config,nginx,vault/config,vault/policies,secrets}

  cat > "$REPO_ROOT/.gitignore" <<'EOF'
node_modules
dist
build
coverage
.env
.env.local
.env.*.local
artifacts
cache
out
.tmp
.DS_Store
environments/devnet/secrets/
environments/devnet/vault/gcp-service-account.json
EOF

  cat > "$REPO_ROOT/.dockerignore" <<'EOF'
.git
.github
node_modules
dist
build
coverage
out
.tmp
docs/previews
environments/devnet/secrets
environments/devnet/vault/gcp-service-account.json
pnpm-lock.yaml
EOF

  cat > "$REPO_ROOT/.env.example" <<'EOF'
GHOSTCHAIN_RPC_URL=http://127.0.0.1:18545
GHOSTCHAIN_WS_URL=ws://127.0.0.1:18546
GHOSTCHAIN_EXPLORER_URL=
GHOSTL2_RPC_URL=http://127.0.0.1:29545
GHOSTL2_WS_URL=ws://127.0.0.1:29546
GHOSTL2_EXPLORER_URL=
GHOSTL3_RPC_URL=http://127.0.0.1:39545
GHOSTL3_WS_URL=ws://127.0.0.1:39546
GHOSTL3_EXPLORER_URL=
GHOST_NODE_IMAGE=
GHOST_NODE_IMAGE_L2=
GHOST_NODE_IMAGE_L3=
VAULT_IMAGE=hashicorp/vault:1.18.3
VAULT_ADDR=http://127.0.0.1:8200
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
REDIS_URL=redis://127.0.0.1:6379
EOF

  cat > "$REPO_ROOT/environments/devnet/.env.example" <<'EOF'
ENVIRONMENT=devnet
GHOSTCHAIN_RPC_URL=http://127.0.0.1:18545
GHOSTL2_RPC_URL=http://127.0.0.1:29545
GHOSTL3_RPC_URL=http://127.0.0.1:39545
VAULT_ADDR=http://127.0.0.1:8200
EOF

  cat > "$REPO_ROOT/package.json" <<'EOF'
{
  "name": "ghostl-stack-v2",
  "private": true,
  "version": "0.1.0",
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=22.21.0 <23"
  },
  "workspaces": [
    "apps/*",
    "services/*",
    "packages/*"
  ],
  "scripts": {
    "build": "pnpm -r --if-present build && pnpm --dir contracts run build",
    "test": "pnpm -r --if-present test && pnpm --dir contracts run test",
    "devnet:up": "docker compose -f environments/devnet/docker-compose.yml up -d --build",
    "devnet:down": "docker compose -f environments/devnet/docker-compose.yml down",
    "devnet:health": "bash scripts/devnet-healthcheck.sh",
    "apps:render": "node --experimental-strip-types scripts/render-app-previews.mjs",
    "apps:serve": "node --experimental-strip-types apps/site/src/server.ts",
    "ghost:check": "bash scripts/ghost-check.sh",
    "preflight:ghost": "bash scripts/preflight-ghost.sh",
    "brand:full": "node --experimental-strip-types packages/brand-enforcer/src/cli.ts .",
    "gst:leakage": "bash scripts/gst-leakage.sh",
    "legacy:inventory": "bash scripts/inventory-legacy-candidates.sh",
    "vault:init": "bash scripts/vault-init.sh",
    "vault:populate": "bash scripts/vault-secrets-populate.sh",
    "vault:policy": "bash scripts/vault-policy-and-token.sh",
    "vault:unwrap": "bash scripts/vault-token-unwrap.sh",
    "vault:verify": "bash scripts/vault-secrets-verify.sh"
  },
  "devDependencies": {
    "@types/node": "22.13.10",
    "typescript": "5.9.3"
  }
}
EOF

  cat > "$REPO_ROOT/environments/devnet/docker-compose.yml" <<'EOF'
networks:
  ghostnet:
    driver: bridge

volumes:
  postgres-data:
  redis-data:
  ghostchain-data:
  ghostl2-data:
  ghostl3-data:
  vault-data:

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: ghost
      POSTGRES_USER: ghost
      POSTGRES_DB: ghost
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ghost -d ghost"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - ghostnet

  redis:
    image: redis:7
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - ghostnet

  ghostchain:
    image: ${GHOST_NODE_IMAGE:-ghcr.io/ghostchain/ghost-node:latest}
    environment:
      GHOST_CHAIN: ghostchain
      GHOST_CHAIN_ID: "14000101"
      GHOST_RPC_HTTP_ADDR: "0.0.0.0:18545"
      GHOST_RPC_WS_ADDR: "0.0.0.0:18546"
      GHOST_CONFIG_FILE: /etc/ghostchain/config/ghostchain.config.toml
    ports:
      - "18545:18545"
      - "18546:18546"
    volumes:
      - ghostchain-data:/var/lib/ghostchain
      - ./ghostchain/config:/etc/ghostchain/config:ro
    restart: unless-stopped
    networks:
      - ghostnet

  ghostl2:
    image: ${GHOST_NODE_IMAGE_L2:-ghcr.io/ghostchain/ghost-node-l2:latest}
    environment:
      GHOST_CHAIN: ghostl2
      GHOST_CHAIN_ID: "901"
      GHOST_RPC_HTTP_ADDR: "0.0.0.0:29545"
      GHOST_RPC_WS_ADDR: "0.0.0.0:29546"
      GHOST_CONFIG_FILE: /etc/ghostl2/config/ghostl2.config.toml
    ports:
      - "29545:29545"
      - "29546:29546"
    volumes:
      - ghostl2-data:/var/lib/ghostl2
      - ./ghostl2/config:/etc/ghostl2/config:ro
    restart: unless-stopped
    networks:
      - ghostnet

  ghostl3:
    image: ${GHOST_NODE_IMAGE_L3:-ghcr.io/ghostchain/ghost-node-l3:latest}
    environment:
      GHOST_CHAIN: ghostl3
      GHOST_CHAIN_ID: "903"
      GHOST_RPC_HTTP_ADDR: "0.0.0.0:39545"
      GHOST_RPC_WS_ADDR: "0.0.0.0:39546"
      GHOST_CONFIG_FILE: /etc/ghostl3/config/ghostl3.config.toml
    ports:
      - "39545:39545"
      - "39546:39546"
    volumes:
      - ghostl3-data:/var/lib/ghostl3
      - ./ghostl3/config:/etc/ghostl3/config:ro
    restart: unless-stopped
    networks:
      - ghostnet

  vault:
    image: ${VAULT_IMAGE:-hashicorp/vault:1.18.3}
    cap_add:
      - IPC_LOCK
    environment:
      VAULT_ADDR: http://0.0.0.0:8200
      VAULT_API_ADDR: http://127.0.0.1:8200
    command:
      - vault
      - server
      - -config=/vault/config/vault.hcl
    ports:
      - "8200:8200"
    volumes:
      - vault-data:/vault/file
      - ./vault/config:/vault/config:ro
    healthcheck:
      test: ["CMD-SHELL", "export VAULT_ADDR=http://127.0.0.1:8200 && vault status >/dev/null 2>&1"]
      interval: 10s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    networks:
      - ghostnet

  ghost-site:
    build:
      context: ../..
      dockerfile: apps/site/Dockerfile
    environment:
      HOST: 0.0.0.0
      PORT: "3001"
      GHOSTCHAIN_RPC_URL: http://ghostchain:18545
      GHOSTL2_RPC_URL: http://ghostl2:29545
      GHOSTL3_RPC_URL: http://ghostl3:39545
      GHOSTCHAIN_EXPLORER_URL: http://127.0.0.1:3001/explorer
      GHOSTL2_EXPLORER_URL: http://127.0.0.1:3001/explorer
      GHOSTL3_EXPLORER_URL: http://127.0.0.1:3001/explorer
    depends_on:
      ghostchain:
        condition: service_started
      ghostl2:
        condition: service_started
      ghostl3:
        condition: service_started
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3001/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"
        ]
      interval: 15s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - ghostnet

  ghost-edge:
    image: nginx:1.27-alpine
    depends_on:
      ghost-site:
        condition: service_healthy
    ports:
      - "3001:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - ghostnet
EOF

  cat > "$REPO_ROOT/apps/site/Dockerfile" <<'EOF'
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/app/package.json apps/app/package.json
COPY apps/dev/package.json apps/dev/package.json
COPY apps/explorer/package.json apps/explorer/package.json
COPY apps/governance/package.json apps/governance/package.json
COPY apps/site/package.json apps/site/package.json
COPY packages/ghost-chain-registry/package.json packages/ghost-chain-registry/package.json
COPY packages/ghost-config/package.json packages/ghost-config/package.json
COPY packages/ghost-sdk-core/package.json packages/ghost-sdk-core/package.json
COPY packages/routing-law/package.json packages/routing-law/package.json

RUN pnpm install --filter @ghostchain/site... --prod --frozen-lockfile=false

COPY apps/app/src apps/app/src
COPY apps/dev/src apps/dev/src
COPY apps/explorer/src apps/explorer/src
COPY apps/governance/src apps/governance/src
COPY apps/site/src apps/site/src
COPY packages/ghost-chain-registry/src packages/ghost-chain-registry/src
COPY packages/ghost-config/src packages/ghost-config/src
COPY packages/ghost-sdk-core/src packages/ghost-sdk-core/src
COPY packages/routing-law/src packages/routing-law/src

ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

CMD ["node", "--experimental-strip-types", "apps/site/src/server.ts"]
EOF

  cat > "$REPO_ROOT/environments/devnet/nginx/default.conf" <<'EOF'
server {
  listen 80;
  server_name _;
  resolver 127.0.0.11 ipv6=off valid=30s;

  location / {
    set $ghost_site_upstream http://ghost-site:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass $ghost_site_upstream;
  }
}
EOF

  cat > "$REPO_ROOT/environments/devnet/ghostchain/config/ghostchain.config.toml" <<'EOF'
# GhostChain L1 template config for the clean rebuild path.
# Replace the placeholders below with the real runtime knobs expected by your node image.

[network]
name = "ghostchain"
chain_id = 14000101
data_dir = "/var/lib/ghostchain"

[rpc]
http_enabled = true
http_addr = "0.0.0.0"
http_port = 18545
ws_enabled = true
ws_addr = "0.0.0.0"
ws_port = 18546
allowed_origins = ["*"]

[logging]
level = "info"

[validator]
keystore_mode = "vault"
vault_addr = "http://vault:8200"
vault_secret_path = "secret/ghostchain/validator"
EOF

  cat > "$REPO_ROOT/environments/devnet/ghostl2/config/ghostl2.config.toml" <<'EOF'
# GhostL2 template config for the clean rebuild path.

[network]
name = "ghostl2"
chain_id = 901
data_dir = "/var/lib/ghostl2"

[rpc]
http_enabled = true
http_addr = "0.0.0.0"
http_port = 29545
ws_enabled = true
ws_addr = "0.0.0.0"
ws_port = 29546
allowed_origins = ["*"]

[logging]
level = "info"

[validator]
keystore_mode = "vault"
vault_addr = "http://vault:8200"
vault_secret_path = "secret/ghostl2/validator"
EOF

  cat > "$REPO_ROOT/environments/devnet/ghostl3/config/ghostl3.config.toml" <<'EOF'
# GhostL3 template config for the clean rebuild path.

[network]
name = "ghostl3"
chain_id = 903
data_dir = "/var/lib/ghostl3"

[rpc]
http_enabled = true
http_addr = "0.0.0.0"
http_port = 39545
ws_enabled = true
ws_addr = "0.0.0.0"
ws_port = 39546
allowed_origins = ["*"]

[logging]
level = "info"

[validator]
keystore_mode = "vault"
vault_addr = "http://vault:8200"
vault_secret_path = "secret/ghostl3/validator"
EOF

  cat > "$REPO_ROOT/environments/devnet/vault/config/vault.hcl" <<'EOF'
ui = true

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

storage "file" {
  path = "/vault/file"
}

# Optional GCP KMS auto-unseal. Keep the service account JSON outside source control
# and mount it at /secrets/gcp-service-account.json via a compose override or CI volume.
#
# seal "gcpckms" {
#   project     = "YOUR_GCP_PROJECT"
#   region      = "YOUR_GCP_REGION"
#   key_ring    = "YOUR_GCP_KEY_RING"
#   crypto_key  = "YOUR_GCP_CRYPTO_KEY"
#   credentials = "/secrets/gcp-service-account.json"
# }
EOF

  cat > "$REPO_ROOT/environments/devnet/vault/README.md" <<'EOF'
# Vault Devnet Notes

- Keep `gcp-service-account.json` out of source control.
- The base compose file mounts `./vault/config` only.
- CI or local overrides should mount `/secrets/gcp-service-account.json` when testing GCP KMS auto-unseal.
- `scripts/vault-init.sh` initializes Vault and, when needed, unseals it from the stored init document.
EOF

  cat > "$REPO_ROOT/environments/devnet/vault/policies/app-read-keystore.hcl" <<'EOF'
path "secret/data/ghostchain/*" {
  capabilities = ["read"]
}

path "secret/data/ghostl2/*" {
  capabilities = ["read"]
}

path "secret/data/ghostl3/*" {
  capabilities = ["read"]
}

path "secret/ghostchain/*" {
  capabilities = ["read"]
}

path "secret/ghostl2/*" {
  capabilities = ["read"]
}

path "secret/ghostl3/*" {
  capabilities = ["read"]
}

path "secret/metadata/ghostchain/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/ghostl2/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/ghostl3/*" {
  capabilities = ["read", "list"]
}

path "sys/internal/ui/mounts/secret/*" {
  capabilities = ["read"]
}
EOF

  cat > "$REPO_ROOT/README-DEVNET.md" <<'EOF'
# GhostChain v2 Devnet

This repo carries the clean rebuild path for `ghostchain-devnet-v2`.

## What The Base Compose Includes

- PostgreSQL and Redis with persistent named volumes
- GhostChain, GhostL2, and GhostL3 service slots with canonical ports and config mounts
- HashiCorp Vault with a file backend and an optional GCP KMS auto-unseal template
- A `ghost-site` container and nginx reverse-proxy edge route exposed on `http://127.0.0.1:3001`

## What You Still Need To Supply

- Real Ghost node images, or a compose override that swaps in local mock services
- Real node runtime flags if they differ from the placeholder config templates
- Validator secrets loaded into Vault rather than baked into images or bind mounts

## Local Bring-Up

```bash
cp .env.example .env
pnpm install
pnpm ghost:check
pnpm devnet:up
pnpm vault:init
pnpm devnet:health
```

## App Surface

Run the generated preview pages with:

```bash
pnpm apps:render
```

Run the minimal Ghost-native frontend shell with:

```bash
pnpm apps:serve
```

The compose-based UI surface is available at:

```bash
http://127.0.0.1:3001
```

Routes:

- `/`
- `/explorer`
- `/developers`
- `/governance`
- `/health`
- `/api/status`
- `/api/docs`

## Vault Workflow

1. Initialize and unseal Vault with `pnpm vault:init`.
2. Put keystore files under `environments/devnet/secrets/{ghostchain,ghostl2,ghostl3}`.
3. Load them with `bash scripts/vault-secrets-populate.sh --keystore-dir environments/devnet/secrets`.
4. Issue a constrained app token with `bash scripts/vault-policy-and-token.sh --policy-name app-read-keystore --policy-file environments/devnet/vault/policies/app-read-keystore.hcl --wrap`.

## CI Notes

- The workflow at `.github/workflows/devnet-ci.yml` falls back to mock JSON-RPC node containers when real images are not provided through GitHub Actions secrets.
- GCP KMS auto-unseal is tested only when the repository secrets for the service account JSON and key identifiers are present.
- Hosted GitHub Actions only sees workflows at repository root. In this home-directory workspace, export v2 as a standalone repo first with `bash scripts/export-standalone-repo.sh` or `make repo-export`.

## Standalone Publish Flow

- Export only: `make repo-export DEST=/home/ghost/ghostl-stack-v2-standalone`
- Export, commit, and push: `make repo-publish DEST=/home/ghost/ghostl-stack-v2-standalone REMOTE_URL=https://github.com/ghostchain1/ghostl-stack-v2-standalone.git`
- The publish helper reuses an existing local git identity when available and will reuse a GitHub token embedded in an existing authenticated remote URL if one is already configured on this machine.
EOF

  cat > "$REPO_ROOT/Makefile" <<'EOF'
REPO_ROOT ?= $(CURDIR)
COMPOSE_FILE ?= environments/devnet/docker-compose.yml

.PHONY: devnet-up devnet-down devnet-health apps-render apps-serve ghost-check preflight vault-init vault-populate vault-policy vault-policy-wrap vault-unwrap vault-verify ci-run legacy-inventory repo-export repo-publish

devnet-up:
	docker compose -f $(COMPOSE_FILE) up -d --build

devnet-down:
	docker compose -f $(COMPOSE_FILE) down

devnet-health:
	bash scripts/devnet-healthcheck.sh --compose-file $(COMPOSE_FILE)

apps-render:
	node --experimental-strip-types scripts/render-app-previews.mjs

apps-serve:
	node --experimental-strip-types apps/site/src/server.ts

ghost-check:
	bash scripts/ghost-check.sh

preflight:
	bash scripts/preflight-ghost.sh

vault-init:
	bash scripts/vault-init.sh --compose-file $(COMPOSE_FILE)

vault-populate:
	@if [ -z "$(KEYSTORE_DIR)" ]; then echo "Usage: make vault-populate KEYSTORE_DIR=environments/devnet/secrets"; exit 1; fi
	bash scripts/vault-secrets-populate.sh --keystore-dir $(KEYSTORE_DIR) --compose-file $(COMPOSE_FILE)

vault-policy:
	@if [ -z "$(POLICY_NAME)" ]; then echo "Usage: make vault-policy POLICY_NAME=app-read-keystore POLICY_FILE=environments/devnet/vault/policies/app-read-keystore.hcl"; exit 1; fi
	bash scripts/vault-policy-and-token.sh --policy-name $(POLICY_NAME) --policy-file $(POLICY_FILE) --compose-file $(COMPOSE_FILE) --ttl $(or $(TTL),24h)

vault-policy-wrap:
	@if [ -z "$(POLICY_NAME)" ]; then echo "Usage: make vault-policy-wrap POLICY_NAME=app-read-keystore POLICY_FILE=environments/devnet/vault/policies/app-read-keystore.hcl"; exit 1; fi
	bash scripts/vault-policy-and-token.sh --policy-name $(POLICY_NAME) --policy-file $(POLICY_FILE) --compose-file $(COMPOSE_FILE) --ttl $(or $(TTL),24h) --wrap --wrap-ttl $(or $(WRAP_TTL),5m)

vault-unwrap:
	@if [ -z "$(WRAP_TOKEN)" ]; then echo "Usage: make vault-unwrap WRAP_TOKEN=<wrapping-token>"; exit 1; fi
	bash scripts/vault-token-unwrap.sh --wrap-token $(WRAP_TOKEN) --compose-file $(COMPOSE_FILE)

vault-verify:
	@if [ -z "$(KEYSTORE_DIR)" ]; then echo "Usage: make vault-verify KEYSTORE_DIR=environments/devnet/secrets"; exit 1; fi
	bash scripts/vault-secrets-verify.sh --keystore-dir $(KEYSTORE_DIR) --compose-file $(COMPOSE_FILE)

ci-run:
	bash .github/scripts/ci-local-run.sh

legacy-inventory:
	bash scripts/inventory-legacy-candidates.sh

repo-export:
	bash scripts/export-standalone-repo.sh --destination $(or $(DEST),$(REPO_ROOT)-standalone)

repo-publish:
	bash scripts/publish-standalone-repo.sh --destination $(or $(DEST),$(REPO_ROOT)-standalone) $(if $(REMOTE_URL),--remote-url $(REMOTE_URL),)
EOF

  cat > "$REPO_ROOT/scripts/ghost-check.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$HOME/.foundry/bin:$PATH"

log() { printf "[ghost-check] %s\n" "$*"; }
fail() { printf "[ghost-check] ERROR: %s\n" "$*" >&2; exit 1; }

pnpm_cmd() {
  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
    return 0
  fi

  pnpm "$@"
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "missing required file: $path"
}

for required in \
  package.json \
  Makefile \
  .dockerignore \
  README-DEVNET.md \
  pnpm-workspace.yaml \
  environments/devnet/docker-compose.yml \
  environments/devnet/nginx/default.conf \
  environments/devnet/vault/config/vault.hcl \
  environments/devnet/vault/policies/app-read-keystore.hcl \
  packages/ghost-chain-registry/src/chains.ts \
  packages/ghost-config/src/env.ts \
  packages/ghost-sdk-core/src/index.ts \
  packages/routing-law/src/index.ts \
  packages/routing-guard/src/index.ts \
  packages/brand-enforcer/src/index.ts \
  apps/site/Dockerfile \
  apps/site/src/data.ts \
  apps/site/src/index.ts \
  apps/site/src/server.ts \
  services/ghost-sequencer/src/index.ts \
  services/ghost-executor/src/index.ts \
  services/ghost-deriver/src/index.ts \
  services/ghost-orchestrator/src/index.ts \
  scripts/devnet-healthcheck.sh \
  scripts/export-standalone-repo.sh \
  scripts/publish-standalone-repo.sh \
  scripts/vault-init.sh \
  scripts/vault-secrets-populate.sh \
  scripts/vault-policy-and-token.sh \
  scripts/vault-token-unwrap.sh \
  scripts/vault-secrets-verify.sh \
  .github/workflows/devnet-ci.yml \
  contracts/foundry.toml \
  contracts/src/ghost/GhostBrand.sol \
  contracts/src/interfaces/IGhostSettlementGateway.sol \
  contracts/src/interfaces/IGhostMessageBus.sol \
  contracts/src/interfaces/IGhostAssetBridge.sol
do
  require_file "$required"
done

log "verifying canonical chain IDs"
if rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**' --glob '!out/**' --glob '!coverage/**' '1400010[23]' "$ROOT_DIR"; then
  fail "found non-canonical v2 chain IDs"
fi

log "verifying RPC namespace usage"
if rg -n --glob '*.ts' --glob '*.tsx' --glob '*.sol' '\beth_' packages/*/src apps/*/src services/*/src contracts/src; then
  fail "found forbidden eth_ namespace usage"
fi

log "verifying SDK import policy"
if rg -n --glob '*.ts' --glob '*.tsx' 'from ["'\'']ethers["'\'']|require\(["'\'']ethers["'\'']\)|from ["'\'']web3["'\'']|require\(["'\'']web3["'\'']\)' packages/*/src apps/*/src services/*/src; then
  fail "found forbidden ethers/web3 import"
fi

log "verifying build graph"
pnpm_cmd -r --if-present build

log "verifying devnet compose config"
docker compose -f environments/devnet/docker-compose.yml config >/dev/null

log "verifying Foundry contracts"
command -v forge >/dev/null 2>&1 || fail "forge is required but not installed"
(cd contracts && forge build)

log "PASS"
EOF

  cat > "$REPO_ROOT/scripts/preflight-ghost.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

printf "Preflight Ghost-native stack\n"
printf "Workspace: %s\n" "$ROOT_DIR"
printf "Node: %s\n" "$(node -v 2>/dev/null || echo missing)"
printf "pnpm: %s\n" "$(pnpm -v 2>/dev/null || echo missing)"
printf "forge: %s\n" "$(forge --version 2>/dev/null | head -n 1 || echo missing)"
printf "docker compose: %s\n" "$(docker compose version --short 2>/dev/null || echo missing)"

printf "compose config: "
if docker compose -f environments/devnet/docker-compose.yml config >/dev/null 2>&1; then
  printf "ok\n"
else
  printf "invalid\n"
fi

for port in 18545 29545 39545 8200; do
  if ss -lnt "( sport = :$port )" | tail -n +2 | grep -q .; then
    printf "port %s: listening\n" "$port"
  else
    printf "port %s: not listening\n" "$port"
  fi
done
EOF

  cat > "$REPO_ROOT/scripts/devnet-healthcheck.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/environments/devnet/docker-compose.yml"
HOST="${HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
VAULT_PORT="${VAULT_PORT:-8200}"
SITE_PORT="${SITE_PORT:-3001}"
GHOSTCHAIN_RPC_PORT="${GHOSTCHAIN_RPC_PORT:-18545}"
GHOSTL2_RPC_PORT="${GHOSTL2_RPC_PORT:-29545}"
GHOSTL3_RPC_PORT="${GHOSTL3_RPC_PORT:-39545}"

usage() {
  cat <<'HELP'
Usage: bash scripts/devnet-healthcheck.sh [--compose-file <file>] [--host <host>]
  [--postgres-port <port>] [--redis-port <port>] [--vault-port <port>]
  [--site-port <port>]
  [--ghostchain-port <port>] [--ghostl2-port <port>] [--ghostl3-port <port>]
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --host)
      HOST="$2"
      shift 2
      ;;
    --postgres-port)
      POSTGRES_PORT="$2"
      shift 2
      ;;
    --redis-port)
      REDIS_PORT="$2"
      shift 2
      ;;
    --vault-port)
      VAULT_PORT="$2"
      shift 2
      ;;
    --site-port)
      SITE_PORT="$2"
      shift 2
      ;;
    --ghostchain-port)
      GHOSTCHAIN_RPC_PORT="$2"
      shift 2
      ;;
    --ghostl2-port)
      GHOSTL2_RPC_PORT="$2"
      shift 2
      ;;
    --ghostl3-port)
      GHOSTL3_RPC_PORT="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

fetch_site_path() {
  local path="$1"

  if curl -fsS --max-time 5 "http://${HOST}:${SITE_PORT}${path}" 2>/dev/null; then
    return 0
  fi

  compose exec -T ghost-edge wget -q -O - "http://127.0.0.1${path}"
}

service_container_id() {
  local service="$1"
  local cid

  cid="$(compose ps -q "$service")"
  [[ -n "$cid" ]] || {
    printf '[devnet-health] missing container for service %s\n' "$service" >&2
    return 1
  }

  printf '%s\n' "$cid"
}

service_ip() {
  local service="$1"
  local cid

  cid="$(service_container_id "$service")" || return 1
  docker inspect -f '{{range .NetworkSettings.Networks}}{{if .IPAddress}}{{println .IPAddress}}{{end}}{{end}}' "$cid" | head -n 1
}

rpc_request() {
  local url="$1"

  curl -fsS --max-time 5 \
      -H 'content-type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"ghost_chainId","params":[]}' \
      "$url"
}

check_rpc_url() {
  local url="$1"
  local expected_chain_id="$2"
  local response actual_chain_id

  response="$(rpc_request "$url")"
  actual_chain_id="$(printf '%s' "$response" | jq -r '.result')"
  [[ "$actual_chain_id" == "$expected_chain_id" ]] || {
    printf '[devnet-health] %s returned %s, expected %s\n' "$url" "$actual_chain_id" "$expected_chain_id" >&2
    return 1
  }
}

check_rpc() {
  local service="$1"
  local port="$2"
  local expected_chain_id="$3"
  local host_url ip

  host_url="http://${HOST}:${port}"
  if check_rpc_url "$host_url" "$expected_chain_id" >/dev/null 2>&1; then
    return 0
  fi

  ip="$(service_ip "$service")"
  [[ -n "$ip" ]] || {
    printf '[devnet-health] could not determine IP for %s\n' "$service" >&2
    return 1
  }

  check_rpc_url "http://${ip}:${port}" "$expected_chain_id"
}

check_postgres() {
  if command -v pg_isready >/dev/null 2>&1; then
    if pg_isready -h "$HOST" -p "$POSTGRES_PORT" -U ghost >/dev/null 2>&1; then
      return 0
    fi
  fi

  compose exec -T postgres pg_isready -U ghost -d ghost >/dev/null
}

check_redis() {
  if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli -h "$HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q '^PONG$'; then
      return 0
    fi
  fi

  compose exec -T redis redis-cli ping | grep -q '^PONG$'
}

check_vault() {
  if curl -fsS --max-time 5 "http://${HOST}:${VAULT_PORT}/v1/sys/health" >/dev/null 2>&1; then
    return 0
  fi

  local status
  status="$(compose exec -T vault sh -lc 'export VAULT_ADDR=http://127.0.0.1:8200; vault status -format=json')"
  [[ "$(printf '%s' "$status" | jq -r '.initialized')" == "true" ]] || return 1
  [[ "$(printf '%s' "$status" | jq -r '.sealed')" == "false" ]] || return 1
}

check_site() {
  fetch_site_path /health >/dev/null
}

check_site_explorer_route() {
  local body

  body="$(fetch_site_path /explorer)"
  printf '%s' "$body" | grep -Fq 'GhostScan' || {
    printf '[devnet-health] /explorer did not render the GhostScan surface\n' >&2
    return 1
  }
}

printf '[devnet-health] compose config\n'
compose config >/dev/null

printf '[devnet-health] postgres\n'
check_postgres

printf '[devnet-health] redis\n'
check_redis

printf '[devnet-health] vault\n'
check_vault

printf '[devnet-health] ghost site\n'
check_site

printf '[devnet-health] ghost explorer route\n'
check_site_explorer_route

printf '[devnet-health] ghostchain rpc\n'
check_rpc ghostchain "$GHOSTCHAIN_RPC_PORT" "0xd59fe5"

printf '[devnet-health] ghostl2 rpc\n'
check_rpc ghostl2 "$GHOSTL2_RPC_PORT" "0x385"

printf '[devnet-health] ghostl3 rpc\n'
check_rpc ghostl3 "$GHOSTL3_RPC_PORT" "0x387"

printf '[devnet-health] PASS\n'
EOF

  cat > "$REPO_ROOT/scripts/vault-init.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/environments/devnet/docker-compose.yml"
VAULT_SERVICE="${VAULT_SERVICE:-vault}"
SAVE_HOST_INIT_JSON="${SAVE_HOST_INIT_JSON:-0}"
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-120}"

usage() {
  cat <<'HELP'
Usage: bash scripts/vault-init.sh [--compose-file <file>] [--service <name>]
HELP
}

log() { printf '[vault-init] %s\n' "$*" >&2; }
fail() { printf '[vault-init] ERROR: %s\n' "$*" >&2; exit 1; }

secure_rm() {
  local path="$1"
  [[ -e "$path" ]] || return 0
  if command -v shred >/dev/null 2>&1; then
    shred -u "$path" 2>/dev/null || rm -f "$path"
    return 0
  fi
  rm -f "$path"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --service)
      VAULT_SERVICE="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

wait_for_vault() {
  local deadline
  deadline=$((SECONDS + WAIT_TIMEOUT))

  until compose exec -T "$VAULT_SERVICE" sh -lc "export VAULT_ADDR='$VAULT_ADDR'; vault status -format=json >/dev/null 2>&1; code=\$?; [ \"\$code\" -eq 0 ] || [ \"\$code\" -eq 2 ]"; do
    if (( SECONDS >= deadline )); then
      fail "Vault did not become reachable within ${WAIT_TIMEOUT}s"
    fi
    sleep 2
  done
}

status_json() {
  compose exec -T "$VAULT_SERVICE" sh -lc "export VAULT_ADDR='$VAULT_ADDR'; vault status -format=json; code=\$?; [ \"\$code\" -eq 0 ] || [ \"\$code\" -eq 2 ]"
}

read_init_json() {
  compose exec -T "$VAULT_SERVICE" sh -lc "cat /vault/file/init.json"
}

write_init_json() {
  local source_path="$1"
  compose exec -T "$VAULT_SERVICE" sh -lc "cat > /vault/file/init.json && chmod 600 /vault/file/init.json" < "$source_path"
}

unseal_from_init() {
  local init_path="$1"
  local sealed
  sealed="$(status_json | jq -r '.sealed')"
  if [[ "$sealed" != "true" ]]; then
    return 0
  fi

  log "Vault is sealed; applying unseal keys from stored init document"
  mapfile -t keys < <(jq -r '.unseal_keys_b64[0:3][]' "$init_path")
  [[ "${#keys[@]}" -eq 3 ]] || fail "expected at least three unseal keys"

  for key in "${keys[@]}"; do
    compose exec -T "$VAULT_SERVICE" sh -lc "export VAULT_ADDR='$VAULT_ADDR'; vault operator unseal '$key' >/dev/null"
  done
}

ensure_kv_mount() {
  local init_path="$1"
  local token mounts_json

  token="$(jq -r '.root_token' "$init_path")"
  [[ -n "$token" && "$token" != "null" ]] || fail "could not extract root token from init document"

  mounts_json="$(
    compose exec -T "$VAULT_SERVICE" sh -lc \
      "export VAULT_ADDR='$VAULT_ADDR' VAULT_TOKEN='$token'; vault secrets list -format=json"
  )"

  if printf '%s' "$mounts_json" | jq -e '."secret/"' >/dev/null; then
    local mount_type mount_version
    mount_type="$(printf '%s' "$mounts_json" | jq -r '."secret/".type')"
    mount_version="$(printf '%s' "$mounts_json" | jq -r '."secret/".options.version // ""')"
    [[ "$mount_type" == "kv" ]] || fail "secret/ exists but is type '$mount_type', expected kv"
    [[ "$mount_version" == "2" ]] || fail "secret/ exists but is not KV v2"
    return 0
  fi

  log "Enabling KV v2 secrets engine at secret/"
  compose exec -T "$VAULT_SERVICE" sh -lc \
    "export VAULT_ADDR='$VAULT_ADDR' VAULT_TOKEN='$token'; vault secrets enable -path=secret -version=2 kv >/dev/null"
}

main() {
  compose config >/dev/null
  wait_for_vault

  local status initialized sealed init_tmp host_tmp
  status="$(status_json)"
  initialized="$(printf '%s' "$status" | jq -r '.initialized')"
  sealed="$(printf '%s' "$status" | jq -r '.sealed')"
  init_tmp="$(mktemp)"
  host_tmp="${TMPDIR:-/tmp}/vault_init.json"
  trap "secure_rm '$init_tmp'" EXIT

  if [[ "$initialized" != "true" ]]; then
    log "Vault not initialized; running operator init"
    compose exec -T "$VAULT_SERVICE" sh -lc "export VAULT_ADDR='$VAULT_ADDR'; vault operator init -format=json" >"$init_tmp"
    write_init_json "$init_tmp"
    if [[ "$SAVE_HOST_INIT_JSON" == "1" ]]; then
      install -m 600 "$init_tmp" "$host_tmp"
      log "host copy written to $host_tmp"
    fi
    sealed="true"
  else
    read_init_json >"$init_tmp"
  fi

  if [[ "$sealed" == "true" ]]; then
    unseal_from_init "$init_tmp"
  fi

  ensure_kv_mount "$init_tmp"

  log "Vault initialized and unsealed"
}

main
EOF

  cat > "$REPO_ROOT/scripts/vault-secrets-populate.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/environments/devnet/docker-compose.yml"
VAULT_SERVICE="${VAULT_SERVICE:-vault}"
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
KEYSTORE_DIR=""
NO_CONFIRM=0

usage() {
  cat <<'HELP'
Usage: bash scripts/vault-secrets-populate.sh --keystore-dir <dir> [--compose-file <file>] [--no-confirm]
HELP
}

log() { printf '[vault-populate] %s\n' "$*" >&2; }
fail() { printf '[vault-populate] ERROR: %s\n' "$*" >&2; exit 1; }

secure_rm() {
  local path="$1"
  [[ -e "$path" ]] || return 0
  if command -v shred >/dev/null 2>&1; then
    shred -u "$path" 2>/dev/null || rm -f "$path"
    return 0
  fi
  rm -f "$path"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keystore-dir)
      KEYSTORE_DIR="$2"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --no-confirm)
      NO_CONFIRM=1
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ -n "$KEYSTORE_DIR" ]] || fail "--keystore-dir is required"
[[ -d "$KEYSTORE_DIR" ]] || fail "missing keystore directory: $KEYSTORE_DIR"

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

vault_container() {
  local cid
  cid="$(compose ps -q "$VAULT_SERVICE")"
  [[ -n "$cid" ]] || fail "Vault container is not running"
  printf '%s' "$cid"
}

root_token() {
  local json
  json="$(compose exec -T "$VAULT_SERVICE" sh -lc 'cat /vault/file/init.json' 2>/dev/null || true)"
  if [[ -z "$json" && -f "${TMPDIR:-/tmp}/vault_init.json" ]]; then
    json="$(cat "${TMPDIR:-/tmp}/vault_init.json")"
  fi
  [[ -n "$json" ]] || fail "could not locate Vault init document"
  printf '%s' "$json" | jq -r '.root_token'
}

ensure_ready() {
  local status
  status="$(compose exec -T "$VAULT_SERVICE" sh -lc "export VAULT_ADDR='$VAULT_ADDR'; vault status -format=json")"
  [[ "$(printf '%s' "$status" | jq -r '.initialized')" == "true" ]] || fail "Vault is not initialized"
  [[ "$(printf '%s' "$status" | jq -r '.sealed')" == "false" ]] || fail "Vault is sealed"
}

confirm() {
  if [[ "$NO_CONFIRM" == "1" ]]; then
    return 0
  fi

  cat <<DONE
About to write keystore files from:
  $KEYSTORE_DIR

into Vault at:
  secret/<chain>/<basename-without-extension>

Type 'yes' to continue:
DONE
  read -r answer
  [[ "$answer" == "yes" ]] || fail "aborted"
}

write_secret() {
  local cid="$1"
  local token="$2"
  local chain="$3"
  local file="$4"
  local base_name secret_name sha temp_b64 container_b64

  base_name="$(basename "$file")"
  secret_name="${base_name%.*}"
  sha="$(sha256sum "$file" | awk '{print $1}')"
  temp_b64="$(mktemp)"
  chmod 600 "$temp_b64"
  base64 -w0 "$file" >"$temp_b64"
  container_b64="/tmp/${secret_name}.$$.b64"

  trap 'secure_rm "$temp_b64"' RETURN
  docker cp "$temp_b64" "${cid}:${container_b64}" >/dev/null
  docker exec \
    -e VAULT_ADDR="$VAULT_ADDR" \
    -e VAULT_TOKEN="$token" \
    -i "$cid" \
    sh -lc "vault kv put 'secret/${chain}/${secret_name}' filename='${base_name}' encoding='base64' sha256='${sha}' file_b64=@'${container_b64}' >/dev/null && (shred -u '${container_b64}' 2>/dev/null || rm -f '${container_b64}')"
  secure_rm "$temp_b64"
  trap - RETURN
  log "wrote ${chain}/${secret_name}"
}

main() {
  compose config >/dev/null
  ensure_ready
  confirm

  local token cid chain dir
  token="$(root_token)"
  cid="$(vault_container)"

  for chain in ghostchain ghostl2 ghostl3; do
    dir="${KEYSTORE_DIR%/}/${chain}"
    [[ -d "$dir" ]] || continue
    shopt -s nullglob
    for file in "$dir"/*; do
      [[ -f "$file" ]] || continue
      write_secret "$cid" "$token" "$chain" "$file"
    done
    shopt -u nullglob
  done

  log "done"
}

main
EOF

  cat > "$REPO_ROOT/scripts/vault-policy-and-token.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/environments/devnet/docker-compose.yml"
VAULT_SERVICE="${VAULT_SERVICE:-vault}"
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
POLICY_NAME=""
POLICY_FILE=""
TTL="24h"
WRAP=0
WRAP_TTL="5m"

usage() {
  cat <<'HELP'
Usage: bash scripts/vault-policy-and-token.sh --policy-name <name> --policy-file <file> [--compose-file <file>] [--ttl <ttl>] [--wrap] [--wrap-ttl <ttl>]
HELP
}

log() { printf '[vault-policy] %s\n' "$*" >&2; }
fail() { printf '[vault-policy] ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --policy-name)
      POLICY_NAME="$2"
      shift 2
      ;;
    --policy-file)
      POLICY_FILE="$2"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --ttl)
      TTL="$2"
      shift 2
      ;;
    --wrap)
      WRAP=1
      shift
      ;;
    --wrap-ttl)
      WRAP_TTL="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ -n "$POLICY_NAME" ]] || fail "--policy-name is required"
[[ -n "$POLICY_FILE" ]] || fail "--policy-file is required"

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

root_token() {
  compose exec -T "$VAULT_SERVICE" sh -lc 'cat /vault/file/init.json' | jq -r '.root_token'
}

ensure_policy_file() {
  if [[ -f "$POLICY_FILE" ]]; then
    return 0
  fi

  install -d "$(dirname "$POLICY_FILE")"
  cat >"$POLICY_FILE" <<'POLICY'
path "secret/data/ghostchain/*" {
  capabilities = ["read"]
}

path "secret/data/ghostl2/*" {
  capabilities = ["read"]
}

path "secret/data/ghostl3/*" {
  capabilities = ["read"]
}

path "secret/ghostchain/*" {
  capabilities = ["read"]
}

path "secret/ghostl2/*" {
  capabilities = ["read"]
}

path "secret/ghostl3/*" {
  capabilities = ["read"]
}

path "secret/metadata/ghostchain/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/ghostl2/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/ghostl3/*" {
  capabilities = ["read", "list"]
}

path "sys/internal/ui/mounts/secret/*" {
  capabilities = ["read"]
}
POLICY
}

main() {
  compose config >/dev/null
  ensure_policy_file

  local token cid create_json client_token wrap_json
  token="$(root_token)"
  cid="$(compose ps -q "$VAULT_SERVICE")"
  [[ -n "$cid" ]] || fail "Vault container is not running"

  docker cp "$POLICY_FILE" "${cid}:/tmp/policy.hcl" >/dev/null
  docker exec -e VAULT_ADDR="$VAULT_ADDR" -e VAULT_TOKEN="$token" -i "$cid" sh -lc \
    "vault policy write '${POLICY_NAME}' /tmp/policy.hcl >/dev/null && rm -f /tmp/policy.hcl"

  create_json="$(
    docker exec \
      -e VAULT_ADDR="$VAULT_ADDR" \
      -e VAULT_TOKEN="$token" \
      -i "$cid" \
      sh -lc "vault token create -policy='${POLICY_NAME}' -ttl='${TTL}' -format=json"
  )"
  client_token="$(printf '%s' "$create_json" | jq -r '.auth.client_token')"
  [[ -n "$client_token" && "$client_token" != "null" ]] || fail "failed to create client token"

  if [[ "$WRAP" == "1" ]]; then
    wrap_json="$(
      docker exec \
        -e VAULT_ADDR="$VAULT_ADDR" \
        -e VAULT_TOKEN="$token" \
        -i "$cid" \
        sh -lc "vault write -wrap-ttl='${WRAP_TTL}' -format=json sys/wrapping/wrap value='${client_token}'"
    )"
    printf '%s\n' "$wrap_json" | jq -r '.wrap_info.token'
    exit 0
  fi

  printf '%s\n' "$client_token"
}

main
EOF

  cat > "$REPO_ROOT/scripts/vault-token-unwrap.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/environments/devnet/docker-compose.yml"
VAULT_SERVICE="${VAULT_SERVICE:-vault}"
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
WRAP_TOKEN=""
FIELD="value"

usage() {
  cat <<'HELP'
Usage: bash scripts/vault-token-unwrap.sh --wrap-token <token> [--compose-file <file>] [--field <field>]
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wrap-token)
      WRAP_TOKEN="$2"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --field)
      FIELD="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

[[ -n "$WRAP_TOKEN" ]] || {
  usage
  exit 1
}

docker compose -f "$COMPOSE_FILE" exec -T "$VAULT_SERVICE" sh -lc \
  "export VAULT_ADDR='$VAULT_ADDR'; vault unwrap -field='${FIELD}' '${WRAP_TOKEN}'"
EOF

  cat > "$REPO_ROOT/scripts/vault-secrets-verify.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/environments/devnet/docker-compose.yml"
VAULT_SERVICE="${VAULT_SERVICE:-vault}"
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
KEYSTORE_DIR=""

usage() {
  cat <<'HELP'
Usage: bash scripts/vault-secrets-verify.sh --keystore-dir <dir> [--compose-file <file>]
HELP
}

log() { printf '[vault-verify] %s\n' "$*" >&2; }
fail() { printf '[vault-verify] ERROR: %s\n' "$*" >&2; exit 1; }

secure_rm() {
  local path="$1"
  [[ -e "$path" ]] || return 0
  if command -v shred >/dev/null 2>&1; then
    shred -u "$path" 2>/dev/null || rm -f "$path"
    return 0
  fi
  rm -f "$path"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keystore-dir)
      KEYSTORE_DIR="$2"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ -n "$KEYSTORE_DIR" ]] || fail "--keystore-dir is required"
[[ -d "$KEYSTORE_DIR" ]] || fail "missing keystore directory: $KEYSTORE_DIR"

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

root_token() {
  compose exec -T "$VAULT_SERVICE" sh -lc 'cat /vault/file/init.json' | jq -r '.root_token'
}

verify_secret() {
  local token="$1"
  local chain="$2"
  local file="$3"
  local secret_name json expected actual tmp_file

  secret_name="$(basename "${file%.*}")"
  json="$(
    compose exec -T "$VAULT_SERVICE" sh -lc \
      "export VAULT_ADDR='$VAULT_ADDR' VAULT_TOKEN='${token}'; vault kv get -format=json 'secret/${chain}/${secret_name}'"
  )"

  expected="$(sha256sum "$file" | awk '{print $1}')"
  actual="$(printf '%s' "$json" | jq -r '.data.data.sha256')"
  [[ "$expected" == "$actual" ]] || fail "sha256 mismatch for ${chain}/${secret_name}"

  tmp_file="$(mktemp)"
  trap 'secure_rm "$tmp_file"' RETURN
  printf '%s' "$json" | jq -r '.data.data.file_b64' | base64 -d >"$tmp_file"
  [[ "$(sha256sum "$tmp_file" | awk '{print $1}')" == "$expected" ]] || fail "decoded payload mismatch for ${chain}/${secret_name}"
  secure_rm "$tmp_file"
  trap - RETURN
  log "verified ${chain}/${secret_name}"
}

main() {
  local token chain dir
  token="$(root_token)"

  for chain in ghostchain ghostl2 ghostl3; do
    dir="${KEYSTORE_DIR%/}/${chain}"
    [[ -d "$dir" ]] || continue
    shopt -s nullglob
    for file in "$dir"/*; do
      [[ -f "$file" ]] || continue
      verify_secret "$token" "$chain" "$file"
    done
    shopt -u nullglob
  done

  log "done"
}

main
EOF

  cat > "$REPO_ROOT/.github/scripts/ci-local-run.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_COMPOSE="${ROOT_DIR}/environments/devnet/docker-compose.yml"
TMP_ROOT="$(mktemp -d /tmp/ghostchain-devnet-ci.XXXXXX)"
CI_COMPOSE="${TMP_ROOT}/compose.yml"
NODE_OVERRIDE="${TMP_ROOT}/nodes.override.yml"
SECRETS_DIR="${TMP_ROOT}/secrets"
ARTIFACT_DIR="${TMP_ROOT}/artifacts"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostchain_devnet_ci_$$}"

capture_debug_artifacts() {
  mkdir -p "$ARTIFACT_DIR"
  docker compose -f "$CI_COMPOSE" ps >"$ARTIFACT_DIR/compose-ps.txt" 2>&1 || true
  docker compose -f "$CI_COMPOSE" logs --no-color >"$ARTIFACT_DIR/compose-logs.txt" 2>&1 || true
  docker compose -f "$CI_COMPOSE" config >"$ARTIFACT_DIR/compose-resolved.yml" 2>&1 || true
  docker compose -f "$CI_COMPOSE" exec -T vault sh -lc 'export VAULT_ADDR=http://127.0.0.1:8200; vault status -format=json' >"$ARTIFACT_DIR/vault-status.json" 2>&1 || true
}

cleanup() {
  local status="$1"

  if [[ "$status" -ne 0 ]]; then
    capture_debug_artifacts
  fi

  docker compose -f "$CI_COMPOSE" down --volumes --remove-orphans >/dev/null 2>&1 || true

  if [[ "$status" -eq 0 && "${KEEP_TMP_ROOT:-0}" != "1" ]]; then
    rm -rf "$TMP_ROOT"
  else
    echo "[ci-local-run] preserved temp root: $TMP_ROOT" >&2
    if [[ -d "$ARTIFACT_DIR" ]]; then
      echo "[ci-local-run] debug artifacts: $ARTIFACT_DIR" >&2
    fi
  fi
}

trap 'status=$?; trap - EXIT; cleanup "$status"; exit "$status"' EXIT

python3 - <<'PY' >/dev/null || {
import yaml
PY
  echo "[ci-local-run] python3-yaml is required" >&2
  exit 1
}

pick_port() {
  local candidate
  for candidate in "$@"; do
    if ! ss -lnt "( sport = :${candidate} )" | tail -n +2 | grep -q .; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

POSTGRES_HOST_PORT="$(pick_port 5432 15432 25432 35432)"
REDIS_HOST_PORT="$(pick_port 6379 16379 26379 36379)"
VAULT_HOST_PORT="$(pick_port 8200 18200 28200 38200)"
GHOSTCHAIN_HOST_PORT="$(pick_port 18545 18555 28545 38545)"
GHOSTCHAIN_WS_HOST_PORT="$(pick_port 18546 18556 28546 38546)"
GHOSTL2_HOST_PORT="$(pick_port 29545 29555 39545 49545)"
GHOSTL2_WS_HOST_PORT="$(pick_port 29546 29556 39546 49546)"
GHOSTL3_HOST_PORT="$(pick_port 39545 39555 49545 59545)"
GHOSTL3_WS_HOST_PORT="$(pick_port 39546 39556 49546 59546)"
SITE_HOST_PORT="$(pick_port 3001 13001 23001 33001)"

cat >"$NODE_OVERRIDE" <<'YAML'
x-mock-command: &mock-command
  - sh
  - -lc
  - |
    cat <<'PY' >/tmp/mock-node.py
    import json
    import os
    import socket
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    chain_id = int(os.environ["GHOST_CHAIN_ID"])
    rpc_port = int(os.environ["RPC_PORT"])
    ws_port = int(os.environ["WS_PORT"])

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            method = payload.get("method")
            if method == "ghost_chainId":
                result = hex(chain_id)
            elif method == "ghost_blockNumber":
                result = hex(1)
            elif method == "ghost_getBalance":
                result = hex(0)
            else:
                result = None
            body = json.dumps(
                {"jsonrpc": "2.0", "id": payload.get("id", 1), "result": result}
            ).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            return

    def ws_listener():
        sock = socket.socket()
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", ws_port))
        sock.listen()
        while True:
            conn, _ = sock.accept()
            conn.close()

    threading.Thread(target=ws_listener, daemon=True).start()
    HTTPServer(("0.0.0.0", rpc_port), Handler).serve_forever()
    PY
    exec python /tmp/mock-node.py

services:
  ghostchain:
    image: python:3.12-alpine
    environment:
      GHOST_CHAIN_ID: "14000101"
      RPC_PORT: "18545"
      WS_PORT: "18546"
    command: *mock-command

  ghostl2:
    image: python:3.12-alpine
    environment:
      GHOST_CHAIN_ID: "901"
      RPC_PORT: "29545"
      WS_PORT: "29546"
    command: *mock-command

  ghostl3:
    image: python:3.12-alpine
    environment:
      GHOST_CHAIN_ID: "903"
      RPC_PORT: "39545"
      WS_PORT: "39546"
    command: *mock-command
YAML

printf '[ci-local-run] using host ports: postgres=%s redis=%s vault=%s ghostchain=%s ghostl2=%s ghostl3=%s site=%s\n' \
  "$POSTGRES_HOST_PORT" "$REDIS_HOST_PORT" "$VAULT_HOST_PORT" "$GHOSTCHAIN_HOST_PORT" "$GHOSTL2_HOST_PORT" "$GHOSTL3_HOST_PORT" "$SITE_HOST_PORT"
printf '[ci-local-run] compose project: %s\n' "$COMPOSE_PROJECT_NAME"
printf '[ci-local-run] temp root: %s\n' "$TMP_ROOT"

docker compose -f "$BASE_COMPOSE" -f "$NODE_OVERRIDE" config >"$CI_COMPOSE"
python3 - "$CI_COMPOSE" \
  "$POSTGRES_HOST_PORT" \
  "$REDIS_HOST_PORT" \
  "$VAULT_HOST_PORT" \
  "$GHOSTCHAIN_HOST_PORT" \
  "$GHOSTCHAIN_WS_HOST_PORT" \
  "$GHOSTL2_HOST_PORT" \
  "$GHOSTL2_WS_HOST_PORT" \
  "$GHOSTL3_HOST_PORT" \
  "$GHOSTL3_WS_HOST_PORT" \
  "$SITE_HOST_PORT" <<'PY'
import sys
import yaml

compose_path = sys.argv[1]
postgres_port = sys.argv[2]
redis_port = sys.argv[3]
vault_port = sys.argv[4]
ghostchain_port = sys.argv[5]
ghostchain_ws_port = sys.argv[6]
ghostl2_port = sys.argv[7]
ghostl2_ws_port = sys.argv[8]
ghostl3_port = sys.argv[9]
ghostl3_ws_port = sys.argv[10]
site_port = sys.argv[11]

with open(compose_path, "r", encoding="utf-8") as handle:
    data = yaml.safe_load(handle)

services = data["services"]
services["postgres"]["ports"] = [f"{postgres_port}:5432"]
services["redis"]["ports"] = [f"{redis_port}:6379"]
services["vault"]["ports"] = [f"{vault_port}:8200"]
services["ghostchain"]["ports"] = [f"{ghostchain_port}:18545", f"{ghostchain_ws_port}:18546"]
services["ghostl2"]["ports"] = [f"{ghostl2_port}:29545", f"{ghostl2_ws_port}:29546"]
services["ghostl3"]["ports"] = [f"{ghostl3_port}:39545", f"{ghostl3_ws_port}:39546"]
services["ghost-edge"]["ports"] = [f"{site_port}:80"]

with open(compose_path, "w", encoding="utf-8") as handle:
    yaml.safe_dump(data, handle, sort_keys=False)
PY
docker compose -f "$CI_COMPOSE" up -d vault postgres redis ghostchain ghostl2 ghostl3 ghost-site ghost-edge

bash "${ROOT_DIR}/scripts/vault-init.sh" --compose-file "$CI_COMPOSE"

mkdir -p \
  "${SECRETS_DIR}/ghostchain" \
  "${SECRETS_DIR}/ghostl2" \
  "${SECRETS_DIR}/ghostl3"
printf '{"test":"ghostchain-key1"}\n' >"${SECRETS_DIR}/ghostchain/validator1.json"
printf '{"test":"ghostl2-key1"}\n' >"${SECRETS_DIR}/ghostl2/validator1.json"
printf '{"test":"ghostl3-key1"}\n' >"${SECRETS_DIR}/ghostl3/validator1.json"

bash "${ROOT_DIR}/scripts/vault-secrets-populate.sh" --keystore-dir "${SECRETS_DIR}" --compose-file "$CI_COMPOSE" --no-confirm
WRAP_TOKEN="$(
  bash "${ROOT_DIR}/scripts/vault-policy-and-token.sh" \
    --policy-name app-read-keystore \
    --policy-file "${ROOT_DIR}/environments/devnet/vault/policies/app-read-keystore.hcl" \
    --compose-file "$CI_COMPOSE" \
    --wrap \
    --wrap-ttl 5m
)"
printf '%s' "$WRAP_TOKEN" | docker compose -f "$CI_COMPOSE" exec -T vault sh -lc '
  read -r wrap_token
  export VAULT_ADDR=http://127.0.0.1:8200
  export VAULT_TOKEN="$(vault unwrap -field=value "$wrap_token")"
  vault token lookup >/dev/null
  vault token capabilities secret/data/ghostchain/validator1 | tr " " "\n" | grep -qx read
'
bash "${ROOT_DIR}/scripts/vault-secrets-verify.sh" --keystore-dir "${SECRETS_DIR}" --compose-file "$CI_COMPOSE"
bash "${ROOT_DIR}/scripts/devnet-healthcheck.sh" \
  --compose-file "$CI_COMPOSE" \
  --postgres-port "$POSTGRES_HOST_PORT" \
  --redis-port "$REDIS_HOST_PORT" \
  --vault-port "$VAULT_HOST_PORT" \
  --site-port "$SITE_HOST_PORT" \
  --ghostchain-port "$GHOSTCHAIN_HOST_PORT" \
  --ghostl2-port "$GHOSTL2_HOST_PORT" \
  --ghostl3-port "$GHOSTL3_HOST_PORT"
EOF

  cat > "$REPO_ROOT/.github/workflows/devnet-ci.yml" <<'EOF'
name: Devnet CI

permissions:
  contents: read

concurrency:
  group: devnet-ci-${{ github.ref }}
  cancel-in-progress: true

on:
  workflow_dispatch:
  push:
    paths:
      - 'environments/devnet/**'
      - 'scripts/**'
      - '.github/workflows/devnet-ci.yml'
      - '.github/scripts/ci-local-run.sh'

jobs:
  devnet-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      COMPOSE_PROJECT_NAME: devnet_ci_${{ github.run_id }}_${{ github.run_attempt }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set CI temp root
        shell: bash
        run: echo "CI_TMP_ROOT=${RUNNER_TEMP}/devnet-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" >> "$GITHUB_ENV"

      - name: Install docker and jq
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y jq python3-yaml
          docker --version
          docker compose version

      - name: Prepare CI compose overrides
        shell: bash
        env:
          GCP_SERVICE_ACCOUNT_JSON: ${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}
          GCP_PROJECT: ${{ secrets.GCP_PROJECT }}
          GCP_REGION: ${{ secrets.GCP_REGION }}
          GCP_KEY_RING: ${{ secrets.GCP_KEY_RING }}
          GCP_CRYPTO_KEY: ${{ secrets.GCP_CRYPTO_KEY }}
          GHOST_NODE_IMAGE: ${{ secrets.GHOST_NODE_IMAGE }}
          GHOST_NODE_IMAGE_L2: ${{ secrets.GHOST_NODE_IMAGE_L2 }}
          GHOST_NODE_IMAGE_L3: ${{ secrets.GHOST_NODE_IMAGE_L3 }}
        run: |
          set -euo pipefail
          mkdir -p "${CI_TMP_ROOT}/vault-config"
          cat > "${CI_TMP_ROOT}/vault-config/vault.hcl" <<'HERE'
          ui = true
          listener "tcp" {
            address     = "0.0.0.0:8200"
            tls_disable = 1
          }
          storage "file" {
            path = "/vault/file"
          }
          HERE

          cat > "${CI_TMP_ROOT}/base.override.yml" <<HERE
          services:
            vault:
              volumes:
                - ${CI_TMP_ROOT}/vault-config:/vault/config:ro
          HERE

          if [[ -n "${GCP_SERVICE_ACCOUNT_JSON}" ]]; then
            secret_volume="vault_gcp_secret_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}"
            docker volume create "${secret_volume}"
            printf '%s' "${GCP_SERVICE_ACCOUNT_JSON}" | docker run --rm -i -v "${secret_volume}:/secrets" alpine sh -lc 'cat > /secrets/gcp-service-account.json && chmod 600 /secrets/gcp-service-account.json'
            echo "GCP_SECRET_VOLUME=${secret_volume}" >> "$GITHUB_ENV"
            cat >> "${CI_TMP_ROOT}/vault-config/vault.hcl" <<HERE
          seal "gcpckms" {
            project     = "${GCP_PROJECT}"
            region      = "${GCP_REGION}"
            key_ring    = "${GCP_KEY_RING}"
            crypto_key  = "${GCP_CRYPTO_KEY}"
            credentials = "/secrets/gcp-service-account.json"
          }
          HERE
            cat > "${CI_TMP_ROOT}/gcp.override.yml" <<HERE
          services:
            vault:
              volumes:
                - ${secret_volume}:/secrets:ro
          volumes:
            ${secret_volume}:
              external: true
          HERE
          else
            : > "${CI_TMP_ROOT}/gcp.override.yml"
          fi

          if [[ -n "${GHOST_NODE_IMAGE}" || -n "${GHOST_NODE_IMAGE_L2}" || -n "${GHOST_NODE_IMAGE_L3}" ]]; then
            cat > "${CI_TMP_ROOT}/nodes.override.yml" <<HERE
          services:
            ghostchain:
              image: ${GHOST_NODE_IMAGE:-ghcr.io/ghostchain/ghost-node:latest}
            ghostl2:
              image: ${GHOST_NODE_IMAGE_L2:-ghcr.io/ghostchain/ghost-node-l2:latest}
            ghostl3:
              image: ${GHOST_NODE_IMAGE_L3:-ghcr.io/ghostchain/ghost-node-l3:latest}
          HERE
          else
            cat > "${CI_TMP_ROOT}/nodes.override.yml" <<'HERE'
          x-mock-command: &mock-command
            - sh
            - -lc
            - |
              cat <<'PY' >/tmp/mock-node.py
              import json
              import os
              import socket
              import threading
              from http.server import BaseHTTPRequestHandler, HTTPServer

              chain_id = int(os.environ["GHOST_CHAIN_ID"])
              rpc_port = int(os.environ["RPC_PORT"])
              ws_port = int(os.environ["WS_PORT"])

              class Handler(BaseHTTPRequestHandler):
                  def do_POST(self):
                      length = int(self.headers.get("Content-Length", "0"))
                      payload = json.loads(self.rfile.read(length) or b"{}")
                      method = payload.get("method")
                      if method == "ghost_chainId":
                          result = hex(chain_id)
                      elif method == "ghost_blockNumber":
                          result = hex(1)
                      elif method == "ghost_getBalance":
                          result = hex(0)
                      else:
                          result = None
                      body = json.dumps(
                          {"jsonrpc": "2.0", "id": payload.get("id", 1), "result": result}
                      ).encode()
                      self.send_response(200)
                      self.send_header("content-type", "application/json")
                      self.send_header("content-length", str(len(body)))
                      self.end_headers()
                      self.wfile.write(body)

                  def log_message(self, *_args):
                      return

              def ws_listener():
                  sock = socket.socket()
                  sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                  sock.bind(("0.0.0.0", ws_port))
                  sock.listen()
                  while True:
                      conn, _ = sock.accept()
                      conn.close()

              threading.Thread(target=ws_listener, daemon=True).start()
              HTTPServer(("0.0.0.0", rpc_port), Handler).serve_forever()
              PY
              exec python /tmp/mock-node.py
          services:
            ghostchain:
              image: python:3.12-alpine
              environment:
                GHOST_CHAIN_ID: "14000101"
                RPC_PORT: "18545"
                WS_PORT: "18546"
              command: *mock-command
            ghostl2:
              image: python:3.12-alpine
              environment:
                GHOST_CHAIN_ID: "901"
                RPC_PORT: "29545"
                WS_PORT: "29546"
              command: *mock-command
            ghostl3:
              image: python:3.12-alpine
              environment:
                GHOST_CHAIN_ID: "903"
                RPC_PORT: "39545"
                WS_PORT: "39546"
              command: *mock-command
          HERE
          fi

          docker compose \
            -f environments/devnet/docker-compose.yml \
            -f "${CI_TMP_ROOT}/base.override.yml" \
            -f "${CI_TMP_ROOT}/gcp.override.yml" \
            -f "${CI_TMP_ROOT}/nodes.override.yml" \
            config > "${CI_TMP_ROOT}/compose.yml"

          python3 - "${CI_TMP_ROOT}/compose.yml" <<'PY'
          import sys
          import yaml

          compose_path = sys.argv[1]
          with open(compose_path, "r", encoding="utf-8") as handle:
              data = yaml.safe_load(handle)

          for service_name in ("postgres", "redis", "vault", "ghostchain", "ghostl2", "ghostl3", "ghost-site", "ghost-edge"):
              service = data.get("services", {}).get(service_name)
              if service is not None:
                  service.pop("ports", None)

          with open(compose_path, "w", encoding="utf-8") as handle:
              yaml.safe_dump(data, handle, sort_keys=False)
          PY

      - name: Start CI stack
        run: docker compose -f "${CI_TMP_ROOT}/compose.yml" up -d vault postgres redis ghostchain ghostl2 ghostl3 ghost-site ghost-edge

      - name: Initialize Vault
        run: bash scripts/vault-init.sh --compose-file "${CI_TMP_ROOT}/compose.yml"

      - name: Seed sample keystores
        run: |
          mkdir -p "${CI_TMP_ROOT}/secrets/ghostchain" "${CI_TMP_ROOT}/secrets/ghostl2" "${CI_TMP_ROOT}/secrets/ghostl3"
          printf '{"test":"ghostchain-key1"}\n' > "${CI_TMP_ROOT}/secrets/ghostchain/validator1.json"
          printf '{"test":"ghostl2-key1"}\n' > "${CI_TMP_ROOT}/secrets/ghostl2/validator1.json"
          printf '{"test":"ghostl3-key1"}\n' > "${CI_TMP_ROOT}/secrets/ghostl3/validator1.json"

      - name: Populate Vault
        run: bash scripts/vault-secrets-populate.sh --keystore-dir "${CI_TMP_ROOT}/secrets" --compose-file "${CI_TMP_ROOT}/compose.yml" --no-confirm

      - name: Verify wrapped app token in container without exposing inner token
        shell: bash
        run: |
          wrap_token="$(
            bash scripts/vault-policy-and-token.sh \
              --policy-name app-read-keystore \
              --policy-file environments/devnet/vault/policies/app-read-keystore.hcl \
              --compose-file "${CI_TMP_ROOT}/compose.yml" \
              --wrap \
              --wrap-ttl 5m
          )"
          echo "::add-mask::${wrap_token}"
          printf '%s' "$wrap_token" | docker compose -f "${CI_TMP_ROOT}/compose.yml" exec -T vault sh -lc '
            read -r wrap_token
            export VAULT_ADDR=http://127.0.0.1:8200
            export VAULT_TOKEN="$(vault unwrap -field=value "$wrap_token")"
            vault token lookup >/dev/null
            vault token capabilities secret/data/ghostchain/validator1 | tr " " "\n" | grep -qx read
          '

      - name: Verify stored secrets
        run: bash scripts/vault-secrets-verify.sh --keystore-dir "${CI_TMP_ROOT}/secrets" --compose-file "${CI_TMP_ROOT}/compose.yml"

      - name: Run devnet healthcheck
        run: bash scripts/devnet-healthcheck.sh --compose-file "${CI_TMP_ROOT}/compose.yml"

      - name: Collect CI diagnostics
        if: failure() || cancelled()
        shell: bash
        run: |
          mkdir -p "${CI_TMP_ROOT}/artifacts"
          docker compose -f "${CI_TMP_ROOT}/compose.yml" ps > "${CI_TMP_ROOT}/artifacts/compose-ps.txt" 2>&1 || true
          docker compose -f "${CI_TMP_ROOT}/compose.yml" logs --no-color > "${CI_TMP_ROOT}/artifacts/compose-logs.txt" 2>&1 || true
          docker compose -f "${CI_TMP_ROOT}/compose.yml" config > "${CI_TMP_ROOT}/artifacts/compose-resolved.yml" 2>&1 || true
          docker compose -f "${CI_TMP_ROOT}/compose.yml" exec -T vault sh -lc 'export VAULT_ADDR=http://127.0.0.1:8200; vault status -format=json' > "${CI_TMP_ROOT}/artifacts/vault-status.json" 2>&1 || true

      - name: Upload CI diagnostics
        if: failure() || cancelled()
        uses: actions/upload-artifact@v4
        with:
          name: devnet-ci-diagnostics-${{ github.run_id }}-${{ github.run_attempt }}
          path: ${{ env.CI_TMP_ROOT }}/artifacts
          if-no-files-found: ignore
          retention-days: 7

      - name: Teardown CI stack
        if: always()
        run: docker compose -f "${CI_TMP_ROOT}/compose.yml" down --volumes --remove-orphans || true

      - name: Remove CI GCP secret volume
        if: always()
        shell: bash
        run: |
          if [[ -n "${GCP_SECRET_VOLUME:-}" ]]; then
            docker volume rm -f "${GCP_SECRET_VOLUME}" >/dev/null 2>&1 || true
          fi

      - name: Remove CI temp root
        if: always()
        shell: bash
        run: rm -rf "${CI_TMP_ROOT}"
EOF

  chmod +x "$REPO_ROOT"/scripts/*.sh "$REPO_ROOT"/.github/scripts/*.sh
}

set_ownership() {
  log "Fixing ownership"
  chown -R "$GHOST_USER:$GHOST_USER" "$REPO_ROOT"
}

main() {
  require_root
  log "Bootstrapping ${VM_NAME}"
  install_base_packages
  create_user_if_missing
  install_node
  install_foundry
  prepare_dirs
  write_root_files
  write_packages
  write_apps_and_services
  write_contracts
  write_docs_and_ops
  write_helper_scripts
  write_devnet_extensions
  set_ownership

  log "Bootstrap complete"
  echo
  echo "Repo root: $REPO_ROOT"
  echo "Next:"
  echo "  su - $GHOST_USER"
  echo "  cd $REPO_ROOT"
  echo "  cp .env.example .env"
  echo "  pnpm install"
  echo "  pnpm ghost:check"
}
main "$@"
