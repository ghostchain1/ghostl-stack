# ETH Leakage Inventory (Phase 1 — Read-only)

Captured at: `2026-02-06T05:48:28Z`
Repo: `/home/ghost/ghostl-stack`
Branch: `brand/gst-native`
Revision: `e5a0fbcb1973212cb183ba1fd4f725fd8215a3c9`

NOTE: This file contains **historical scan snapshots**. For current repo state, see the latest section: **Refresh: 2026-02-14**.

This inventory flags **GST-native branding leaks** where “ETH / Ethereum / Ether / .eth / unit=eth / *_eth / *_ETH_*” appears in first-party code/config/docs.

Notes:

- **Technical JSON-RPC** compatibility (`eth_*` methods, module name `eth`, and EVM internals like `wei`) are not “business ETH”, but are still tracked where they leak into UI/docs/config naming.
- Some directories contain vendored/upstream code and lockfiles that legitimately include “ethereum/eth” strings. Those are called out under **Allowlist candidates**.
- Scan encountered unreadable paths (permission denied) under `infra/ghostchain/data/**` in this harness; those directories are treated as **out of scope** for text scanning and must be validated on a host with full permissions.

## What was scanned

Primary pattern groups:

- Branding strings: `(?i)\beth\b|\bethereum\b|\bether\b|Ξ`
- Identifier patterns: `_eth`, `amountEth`, `DEMO_AMOUNT_ETH`, `FUND_AMOUNT_ETH`
- Env/config keys: `ETHEREUM_*`, `OP_*_ETH_RPC`
- Observability units: `unit: "eth"`, panel titles containing `(ETH)`

## Summary (first-party focus)

High-signal matches (excluding known vendored/upstream directories like `infra/opstack/**` and `contracts/lib/**`):

- Apps: **1**
- Services: **19**
- Contracts (excluding `contracts/lib/**` and `contracts/reports/**`): **108**
- Infra (excluding `infra/opstack/**`): **97**
- Observability: **4**
- Ops: **36**
- Docs: **96**

## Findings (grouped by subsystem)

Severity legend:

- **CRITICAL**: user-facing “ETH/Ethereum/Ether/.eth/unit=eth” semantics
- **HIGH**: identifiers/config keys that embed ETH semantics (`*_ETH_*`, `*_eth`, `amountEth`, etc.)
- **ALLOWED (technical)**: JSON-RPC namespace/method compatibility (`eth_*`) that must remain for interoperability, but should not leak into product branding

### Apps

- **CRITICAL** — ENS-style `.eth` identifier used as a default:
  ```text
  apps/api/src/server.ts:3409:  const space = env.SNAPSHOT_SPACE || 'ghostldao.eth';
  ```

### Services

- **CRITICAL** — explicit native currency semantics:
  ```text
  services/ghost-relayer/src/index.ts:43:// In this stack, L2/L3 commonly use the native gas token (ETH) for fees.
  ```

- **HIGH** — explicit Ethereum “standard” naming in health checker:
  ```text
  services/ghost-registry/src/health/checker.ts:46:    rpcStandard: 'ethereum';
  services/ghost-registry/src/health/checker.ts:371:          rpcStandard: 'ethereum' as const,
  ```

- **HIGH** — environment example references Ethereum directly:
  ```text
  services/ghost-rollup-proposer/.env.prod.l2.example:2:# Settlement = Ethereum L1 RPC endpoint (HTTPS/TLS, authenticated)
  ```

- **ALLOWED (technical)** — RPC namespace selector exposes `eth` as a user-facing option:
  ```text
  services/ghost-pil/src/config.ts:17:  PIL_RPC_NAMESPACE: z.enum(['eth', 'ghost']).optional(),
  services/ghost-gas-engine/src/config.ts:12:  GHOST_RPC_NAMESPACE: z.enum(['auto', 'eth', 'ghost']).default('auto'),
  services/ghost-pil/src/rpc/ghost-rpc.ts:3:export type RpcNamespace = 'eth' | 'ghost';
  services/ghost-gas-engine/src/rpc/ghost-rpc.ts:3:export type RpcNamespace = 'eth' | 'ghost';
  ```

- **HIGH / ALLOWED (technical)** — “ETH namespace” used in env var names for RPC compatibility policy:
  ```text
  services/ghost-rpc-proxy/index.mjs:38:const RPC_DEPRECATE_ETH_NAMESPACE = process.env.RPC_DEPRECATE_ETH_NAMESPACE === "1";
  services/ghost-rpc-proxy/index.mjs:39:const RPC_REJECT_ETH_NAMESPACE = process.env.RPC_REJECT_ETH_NAMESPACE === "1";
  services/ghost-rpc-proxy/README.md:16:- `RPC_DEPRECATE_ETH_NAMESPACE=1`: set `x-ghost-rpc-warning` header on requests that include `eth_*`
  services/ghost-rpc-proxy/README.md:17:- `RPC_REJECT_ETH_NAMESPACE=1`: hard-reject `eth_*` aliases when a canonical `gst_*` exists (do **not** enable until all internal callers migrated)
  ```

### Contracts

- **HIGH** — demo scripts embed ETH semantics in env keys and identifiers:
  ```text
  contracts/scripts/fund_addresses.ts:21:  const amountEth = process.env.FUND_AMOUNT_ETH || "10";
  contracts/scripts/demo_deposit.ts:14:  const amountEth = process.env.DEMO_AMOUNT_ETH ?? "100";
  contracts/scripts/demo_l1_deposit_erc20.ts:17:  const amountEth = process.env.DEMO_AMOUNT_ETH ?? "1";
  ```

- **HIGH** — invariant naming embeds ETH semantics:
  ```text
  contracts/formal/echidna/TreasuryEchidna.sol:18:    function echidna_cannot_overdraw_eth() public returns (bool) {
  ```

- **HIGH** — docs reference Ethereum signing (should be rephrased for GST-native branding):
  ```text
  contracts/compliance/README.md:43:The oracle verifies the Ethereum Signed Message hash of `digest`.
  ```

### Infra (first-party; excludes `infra/opstack/**`)

- **CRITICAL/HIGH** — L1 compose file is literally named `docker-compose.eth.yml` and uses Ethereum-branded images + keys:
  ```text
  infra/ghostchain/docker-compose.eth.yml:15:    image: ${GETH_IMAGE:-ethereum/client-go:alltools-v1.13.14}
  infra/ghostchain/docker-compose.eth.yml:83:          "wget -qO- --post-data='{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_blockNumber\",\"params\":[]}' --header 'Content-Type: application/json' http://localhost:8545 >/dev/null",
  infra/ghostchain/docker-compose.eth.yml:186:      ETHEREUM_JSONRPC_HTTP_URL: http://ghostchain-node1:8545
  ```

- **ALLOWED (technical)** — JSON-RPC module exposure lists `eth`:
  ```text
  infra/ghostchain/.env:13:L1_HTTP_APIS=eth,net,web3,debug,txpool
  infra/ghostchain/.env:14:L1_WS_APIS=eth,net,web3
  ```

- **HIGH** — demo and key tooling uses `*_ETH` env var naming and prints “ETH”:
  ```text
  infra/scripts/demo-relay.sh:6:DEMO_AMOUNT_ETH="${DEMO_AMOUNT_ETH:-1}"
  infra/scripts/demo-relay.sh:8:echo "Demo relay (amount=${DEMO_AMOUNT_ETH} ETH)"
  infra/scripts/keys/init.sh:100:FUND_AMOUNT_ETH="${FUND_AMOUNT_ETH:-10}"
  ```

- **HIGH** — OP Stack env var keys embed ETH semantics:
  ```text
  infra/docker/compose/docker-compose.core.yml:4559:        "OP_BATCHER_L1_ETH_RPC": "http://l1:8545",
  infra/k8s/blueprints/statefulsets/op-batcher.yaml:63:                "name": "OP_BATCHER_L1_ETH_RPC",
  ```

### Observability

- **CRITICAL** — dashboards label balances in ETH and set Grafana unit to `eth`:
  ```text
  observability/infra/grafana/dashboards/opstack-observability.json:134:      "title": "Batcher balance (ETH)",
  observability/infra/grafana/dashboards/opstack-observability.json:160:          "unit": "eth"
  observability/infra/k8s/observability-stack.yaml:378:          "title": "Batcher balance (ETH)",
  observability/infra/k8s/observability-stack.yaml:387:          "fieldConfig": {"defaults": {"unit": "eth"}, "overrides": []}
  ```

### Ops

- **HIGH** — stack docs/config reference `docker-compose.eth.yml` and Ethereum images:
  ```text
  ops/STACK_AUDIT.md:8:- `ghostchain`: `restarting(2), running(4)` (config files include `/infra/ghostchain/docker-compose.eth.yml` plus a backup path)
  ops/STACK_CANONICAL.yml:8173:          "image": "ethereum/client-go:alltools-v1.13.14",
  ```

- **HIGH** — “no-eth” policy script uses ETH naming (should be GST/legacy branded):
  ```text
  ops/scripts/check-no-eth-rpc.sh:7:log() { printf '[check-no-eth-rpc] %s\n' "$*"; }
  ops/scripts/check-no-eth-rpc.sh:16:BASELINE_FILE="${BASELINE_FILE:-ops/policy/no-eth-rpc-baseline.txt}"
  ```

- **CRITICAL** — attestation docs mention Ethereum explicitly:
  ```text
  ops/attestations/phase6-attestation-checklist.md:173:- [ ] Bridge/interop execution against external chains (Ethereum/Bitcoin/etc) with real RPCs and finality.
  ```

### Docs

- **HIGH** — checklists reference `*_ETH` env vars:
  ```text
  docs/checklists/WHAT_YOU_CAN_RUN_TODAY.md:340:    DEMO_AMOUNT_ETH=1 bash infra/scripts/demo-deposit-l1l2-erc20.sh
  ```

- **HIGH** — autonomy maps repeat `docker-compose.eth.yml` references (many occurrences):
  ```text
  docs/autonomy/service-map.mmd:56:  subgraph compose_9[infra/docker/_backup/20260121-1909/infra/ghostchain/docker-compose.eth.yml]
  docs/autonomy/ports-and-endpoints.md:3098:## infra/ghostchain/docker-compose.eth.yml
  ```

## Allowlist candidates (vendored / upstream / lockfiles)

These paths contain upstream references to Ethereum that are not practical to rebrand and should be allowlisted for the GST leakage gate (Phase 3), while ensuring **first‑party** layers stay GST‑native:

- `infra/opstack/**` (OP Stack + upstream codebases)
- `contracts/lib/**` (vendored solidity tooling/libs)
- `package-lock.json` (third‑party dependency names like `ethereum-cryptography`, `micro-eth-signer`)

## Generated artifacts / snapshots (contain ETH strings)

These are not “source of truth” configs, but they will trip any naive `grep`-based leakage gate unless excluded/allowlisted:

- `ops/snapshots/**`, `ops/preflight/**` (captured compose renders)
- `infra/docker/audit/**` (inventory snapshots)
- `update-report.json`, `update-report.md` (logs and scan excerpts)

---

## Refresh: 2026-02-14 (post-Phase0)

Captured at: `2026-02-14T13:07:10Z`
Repo: `/home/ghost/ghostl-stack`
Branch: `brand/gst-native`
Revision: `3204773edf01ab6de4b2337ab74df67cd0b249b1`

This refresh focuses on **first-party configs + services + contracts + docs** and intentionally excludes high-noise vendored/build-output paths.

### What was scanned (refresh)

High-signal scan roots:

- `infra/ghostchain/**`
- `infra/opstack/**` (compose/manifests only; vendored code excluded below)
- `infra/docker/compose/**`
- `infra/k8s/**`
- `services/**`
- `apps/**`
- `contracts/src/**`, `contracts/scripts/**`, `contracts/test/**`
- `docs/**` (excluding migration/evidence/autonomy docs)
- `ops/**`
- `launch-system/**`

Excluded (vendored / generated / noise):

- `.git/**`
- `**/node_modules/**`
- `**/dist/**`
- `contracts/lib/**`
- `contracts/{out,cache,.foundry-out,reports}/**`
- `infra/opstack/op-geth/**`
- `infra/opstack/optimism-upstream/**`
- `docs/gst-migration/**` (this report corpus)
- `docs/evidence/**`
- `docs/autonomy/**`
- `infra/evidence/**`
- `ops/{snapshots,preflight}/**`
- `ghost-helper-bots/**`
- `releases/**`, `backups/**`

Patterns used (refresh):

- Branding: `\\bETH\\b`, `(?i:\\bethereum\\b)`, `\\bEther\\b`, `Ξ`
- ENS-style domains only: `(?i:\\b[a-z0-9-]+\\.eth\\b)` (avoids `.eth` property false positives)
- Env/config keys: `ETHEREUM_JSONRPC_*`, `OP_*_ETH_RPC`
- Identifiers: `_eth`, `\\bETH_`, `LGE_DEPOSIT_ETH`, `DEMO_AMOUNT_ETH`, `FUND_AMOUNT_ETH`
- Observability: Grafana `"unit": "eth"`

### Findings (refresh; grouped by L1/L2/L3 + services)

Severity legend (same as above):

- **CRITICAL**: user-facing “ETH/Ethereum/Ether/.eth/unit=eth” semantics
- **HIGH**: identifiers/config keys that embed ETH semantics (`*_ETH_*`, `*_eth`, `amountEth`, etc.)
- **ALLOWED (technical)**: JSON-RPC namespace/method compatibility (`eth_*`) that must remain for interoperability, but should not leak into product branding

#### GhostChain L1

- **HIGH** — upstream image naming uses `ethereum/*`:
  ```text
  infra/ghostchain/.env:3:GETH_IMAGE=ethereum/client-go:alltools-v1.13.14
  infra/ghostchain/.env.l1:8:L1_GETH_IMAGE=ethereum/client-go:alltools-v1.13.14
  infra/ghostchain/docker-compose.l1.yml:15:    image: ${GETH_IMAGE:-ethereum/client-go:alltools-v1.13.14}
  infra/ghostchain/docker-compose.l1.yml:45:    image: ${GETH_IMAGE:-ethereum/client-go:alltools-v1.13.14}
  infra/ghostchain/docker-compose.l1.yml:98:    image: ${GETH_IMAGE:-ethereum/client-go:alltools-v1.13.14}
  ```

- **HIGH** — Blockscout env keys are Ethereum-branded (Blockscout convention):
  ```text
  infra/ghostchain/docker-compose.l1.yml:186:      ETHEREUM_JSONRPC_HTTP_URL: http://ghostchain-node1:8545
  infra/ghostchain/docker-compose.l1.yml:187:      ETHEREUM_JSONRPC_TRACE_URL: http://ghostchain-node1:8545
  infra/ghostchain/docker-compose.l1.yml:188:      ETHEREUM_JSONRPC_WS_URL: ws://ghostchain-node1:8546
  ```

- **ALLOWED (technical)** — Besu RPC module list includes `ETH` (module name, not currency):
  ```text
  infra/ghostchain/docker-compose.ibft.yml:32:          --rpc-http-api=ETH,NET,WEB3,IBFT,ADMIN,TXPOOL \
  ```

- **HIGH** — K8s blueprints also embed `ethereum/*` image names:
  ```text
  infra/k8s/blueprints/statefulsets/ghostchain-bootnode.yaml:38:            "image": "${GETH_IMAGE:-ethereum/client-go:alltools-v1.13.14}",
  infra/k8s/blueprints/statefulsets/ghostchain-node1.yaml:38:            "image": "${GETH_IMAGE:-ethereum/client-go:alltools-v1.13.14}",
  ```

#### GhostL2

- **HIGH** — OP Stack env var keys embed ETH semantics:
  ```text
  infra/opstack/docker-compose.challengers.yml:30:      OP_CHALLENGER_L1_ETH_RPC: ${L1_RPC:-http://l1:8545}
  infra/opstack/docker-compose.challengers.yml:32:      OP_CHALLENGER_L2_ETH_RPC: http://l2-geth:8545
  infra/docker/compose/docker-compose.core.yml:4559:        "OP_BATCHER_L1_ETH_RPC": "http://l1:8545",
  infra/docker/compose/docker-compose.core.yml:4560:        "OP_BATCHER_L2_ETH_RPC": "http://l2-a:8545",
  infra/k8s/blueprints/statefulsets/op-batcher.yaml:63:                "name": "OP_BATCHER_L1_ETH_RPC",
  infra/k8s/blueprints/statefulsets/op-proposer.yaml:55:                "name": "OP_PROPOSER_L1_ETH_RPC",
  ```

- **HIGH** — external-chain geth uses Ethereum-branded upstream image:
  ```text
  infra/opstack/docker-compose.mainnet-geth.yml:15:    image: ethereum/client-go:stable
  ```

- **HIGH** — upstream registry naming includes `ethereum-optimism`:
  ```text
  infra/k8s/blueprints/statefulsets/l2-geth.yaml:38:            "image": "ghcr.io/ethereum-optimism/op-geth@sha256:523b0ef36e26c3e8b99cc83d4bf2cc23ec94774be888d930159b1d9362733bc0",
  infra/k8s/blueprints/statefulsets/op-sequencer.yaml:38:            "image": "ghcr.io/ethereum-optimism/op-node@sha256:d0edc8eb74ba826328b351d09b7533a93117348b779416a8f156d7f2363a033b",
  ```

#### GhostL3

- **HIGH** — OP Stack challenger env var keys embed ETH semantics:
  ```text
  infra/opstack/docker-compose.challengers.yml:82:      OP_CHALLENGER_L1_ETH_RPC: ${L3_L1_RPC:-http://l2-geth:8545}
  infra/opstack/docker-compose.challengers.yml:84:      OP_CHALLENGER_L2_ETH_RPC: http://l3-geth:8545
  infra/k8s/blueprints/statefulsets/l3-op-challenger.yaml:97:                "name": "OP_CHALLENGER_L1_ETH_RPC",
  infra/k8s/blueprints/statefulsets/l3-op-challenger.yaml:105:                "name": "OP_CHALLENGER_L2_ETH_RPC",
  ```

- **HIGH** — upstream registry naming includes `ethereum-optimism`:
  ```text
  infra/k8s/blueprints/statefulsets/l3-geth.yaml:38:            "image": "ghcr.io/ethereum-optimism/op-geth@sha256:523b0ef36e26c3e8b99cc83d4bf2cc23ec94774be888d930159b1d9362733bc0",
  infra/k8s/blueprints/statefulsets/l3-op-node.yaml:38:            "image": "ghcr.io/ethereum-optimism/op-node@sha256:d0edc8eb74ba826328b351d09b7533a93117348b779416a8f156d7f2363a033b",
  ```

#### Services

- **HIGH** — Blockscout `.env` uses Ethereum-branded env keys:
  ```text
  services/ghostscout-l1/.env:3:ETHEREUM_JSONRPC_HTTP_URL=http://ghostchain-node1:8545
  services/ghostscout-l1/.env:4:ETHEREUM_JSONRPC_TRACE_URL=http://ghostchain-node1:8545
  services/ghostscout-l1/.env:5:ETHEREUM_JSONRPC_WS_URL=ws://ghostchain-node1:8546
  services/ghostscout-l2/.env:3:ETHEREUM_JSONRPC_HTTP_URL=http://l2-geth:8545
  services/ghostscout-l2/.env:4:ETHEREUM_JSONRPC_TRACE_URL=http://l2-geth:8545
  services/ghostscout-l2/.env:5:ETHEREUM_JSONRPC_WS_URL=ws://l2-geth:8546
  services/ghostscout-l3/.env:3:ETHEREUM_JSONRPC_HTTP_URL=http://l3-geth:8545
  services/ghostscout-l3/.env:4:ETHEREUM_JSONRPC_TRACE_URL=http://l3-geth:8545
  services/ghostscout-l3/.env:5:ETHEREUM_JSONRPC_WS_URL=ws://l3-geth:8546
  ```

- **HIGH** — external chain list includes `ethereum` label:
  ```text
  services/stack.env:241:EXTERNAL_CHAINS=ethereum,polygon,optimism
  ```

- **CRITICAL/HIGH** — narrative refers to “ETH-like settlement”:
  ```text
  services/stack.env:274:# - Use an ERC20 address or 'native' for ETH-like settlement on L1.
  ```

#### Contracts

- **HIGH** — env var name embeds ETH semantics:
  ```text
  contracts/scripts/lge_demo_deposit_native.ts:13:  const amountEthRaw = process.env.LGE_DEPOSIT_ETH;
  ```

- **HIGH** — demo env vars still accept `*_ETH` as compatibility aliases:
  ```text
  contracts/scripts/demo_deposit.ts:14:  const amountGst = process.env.DEMO_AMOUNT_GST ?? process.env.DEMO_AMOUNT_ETH ?? "100";
  contracts/scripts/demo_l1_deposit_erc20.ts:17:  const amountGst = process.env.DEMO_AMOUNT_GST ?? process.env.DEMO_AMOUNT_ETH ?? "1";
  contracts/scripts/demo_l2_withdraw_erc20.ts:17:  const amountGst = process.env.DEMO_AMOUNT_GST ?? process.env.DEMO_AMOUNT_ETH ?? "1";
  contracts/scripts/fund_addresses.ts:21:  const amountGst = process.env.FUND_AMOUNT_GST || process.env.FUND_AMOUNT_ETH || "10";
  ```

- **HIGH** — comments/error strings still say ETH/eth:
  ```text
  contracts/test/foundry/LiquidityGravityEngine.t.sol:247:        // Enable native asset (ETH) support.
  contracts/src/tokens/WrappedNativeToken.sol:6:/// @notice WETH-like wrapper for the native gas token (ETH in dev).
  contracts/src/treasury/TreasuryVault.sol:45:        require(ok, "eth transfer failed");
  contracts/src/liquidity/LoadBalancerVault.sol:344:            // - msg.value == amount: escrow forwarded native ETH
  contracts/src/liquidity/BridgeEscrow.sol:163:        // Avoid forwarding ETH directly (Slither: arbitrary-send-eth). Instead, forward wrapped native to the vault and let the
  contracts/src/liquidity/SettlementOracle.sol:366:                require(ok, "fee eth");
  ```

- **HIGH** — build helper scripts use `ethereum/solc` upstream image:
  ```text
  contracts/scripts/solc-docker/solc-0.8.15.sh:5:IMAGE="ethereum/solc:${VERSION}"
  ```

#### Docs

- **CRITICAL** — diagram uses Ethereum/ETH nodes:
  ```text
  docs/diagrams/liquidity-gravity.mmd:24:        ETH[Ethereum]
  docs/diagrams/liquidity-gravity.mmd:46:    Exec -->|Deploy Capital| ETH
  docs/diagrams/liquidity-gravity.mmd:54:    ETH -->|Yield / Fees| Settle
  ```

- **HIGH** — runbook example still uses `LGE_DEPOSIT_ETH`:
  ```text
  docs/RUNBOOK.md:21:   - `cd contracts && RPC_L1=http://localhost:18545 L1_CHAIN_ID=14000101 DEPLOYER_PRIVATE_KEY=<anvil-key> LGE_VAULT_ADDRESS=<vault> LGE_DEPOSIT_ETH=10 npx hardhat run --network anvil scripts/lge_demo_deposit_native.ts`
  ```

#### Ops / Launch System

- **HIGH** — launch-system utilities/docs say “Ethereum”:
  ```text
  launch-system/lib/hashutil.py:7:- Provide Keccak-256 (Ethereum) and SHA-256 for files/strings.
  launch-system/lib/ethrpc.py:3:Tiny JSON-RPC helper for Ethereum-compatible chains.
  launch-system/LAUNCH-READINESS.md:24:- Keccak-256 implementation validated against Ethereum known vector (`keccak256("")`).
  ```

- **HIGH (generated snapshot)** — ops canonical render still includes `ethereum/*` image names:
  ```text
  ops/STACK_CANONICAL.yml:8173:          "image": "ethereum/client-go:alltools-v1.13.14",
  ```

### Notes (refresh)

- `.eth` domains were only found under vendored libs (e.g., `contracts/lib/**`) and historical migration/evidence outputs.
- The earlier 2026-02-06 snapshot flagged ETH strings in observability assets; current `observability/**` appears GST-branded.
