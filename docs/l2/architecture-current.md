# Ghost L2 Architecture (Current)

This document reflects the *current* Ghost L2 implementation as defined in repo config and compose files. It is intentionally descriptive (not aspirational).

## Sources

- `infra/opstack/docker-compose.yml`
- `infra/opstack/docker-compose.challengers.yml`
- `infra/opstack/config/rollup.json`
- `infra/opstack/config/genesis-l2.json`
- `infra/opstack/config/l1-deployments.json`
- `infra/opstack/config/l2-deployments.json`
- `infra/opstack/.env`
- `infra/scripts/opstack/up-l2.sh`

## Service inventory (L2)

| Role | Service (compose) | Ports (host) | Notes |
| --- | --- | --- | --- |
| L2 execution | `l2-geth` | 29547 (HTTP), 29548 (WS), 29606 (metrics) | OP Geth with archive, JWT auth (8551), metrics enabled. |
| L2 rollup node (derivation) | `op-node` | 9546 (RPC), 7300 (metrics) | Reads L1 via `l1-rpc-proxy`, reads L2 engine via JWT. |
| L2 sequencer | `op-sequencer` | 9646 (RPC), 7303 (metrics) | Sequencer-enabled op-node instance. |
| Batcher | `op-batcher` | 8551 (RPC), 7301 (metrics) | Posts L2 batches to L1 via `op-gate-l1`. |
| Proposer | `op-proposer` | 8560 (RPC), 7302 (metrics) | Posts outputs to L1 via `op-gate-l1`. |
| Challenger (optional) | `op-challenger` | metrics only (default 7303) | Enabled via overlay compose. Uses cannon/Kona assets. |
| Gate (L2) | `op-gate` | 28546 | Guard-aware RPC proxy for L2 operations. |
| Gate (L1) | `op-gate-l1` | 28547 | Guard-aware RPC proxy for L1 operations. |
| L1 RPC proxy | `l1-rpc-proxy` | 18546 | Forwards to host L1 RPC. |
| L2 RPC forwarder | `rpc-forward-l2-18547` | 18547 | Forwards to `op-gate` for local RPC compatibility. |

## Key configs

- Rollup: `infra/opstack/config/rollup.json`
- L2 genesis: `infra/opstack/config/genesis-l2.json`
- L1 chain config used by op-node: `infra/opstack/config/l1-chain.json`
- L1 contracts (OP Stack): `infra/opstack/config/l1-deployments.json`
- L2 contracts (OP Stack): `infra/opstack/config/l2-deployments.json`

## Current data flow (actual)

```mermaid
flowchart LR
  subgraph L1[GhostChain L1]
    L1RPC[HOST_L1_RPC]
    L1Contracts[SystemConfig / OptimismPortal / L2OO or DGF / Bridges]
  end

  subgraph L2[Ghost L2 (OP Stack)]
    L2Geth[l2-geth]
    OpNode[op-node]
    Sequencer[op-sequencer]
    Batcher[op-batcher]
    Proposer[op-proposer]
    GateL2[op-gate]
    GateL1[op-gate-l1]
  end

  subgraph Proxies
    L1Proxy[l1-rpc-proxy]
    L2Forward[rpc-forward-l2-18547]
  end

  L1RPC --> L1Proxy --> OpNode
  L1RPC --> L1Proxy --> Sequencer
  L1RPC --> GateL1 --> Batcher
  L1RPC --> GateL1 --> Proposer
  L2Geth --> GateL2 --> L2Forward
  Sequencer --> L2Geth
  OpNode --> L2Geth
  Batcher --> Sequencer
  Proposer --> Sequencer
  Batcher --> L1Contracts
  Proposer --> L1Contracts
```

## L2 RPC endpoints (host)

- L2 HTTP RPC: `HOST_L2_RPC` (default `http://localhost:29547`)
- L2 WS RPC: `ws://localhost:29548`
- L2 rollup RPC (op-node): `http://localhost:9546`
- Sequencer rollup RPC: `http://localhost:9646`

## Observability (current)

- L2 geth metrics: `http://localhost:29606/debug/metrics/prometheus`
- op-node metrics: `http://localhost:7300/metrics`
- op-batcher metrics: `http://localhost:7301/metrics`
- op-proposer metrics: `http://localhost:7302/metrics`
- op-sequencer metrics: `http://localhost:7303/metrics`

## Reliability controls

- `infra/scripts/doctor-l2.sh` now validates L1 derivation lag, L2 safe lag, and batcher/proposer activity (configurable via `.env.l2` thresholds).
- Prometheus alert rules in `infra/opstack/observability/alert_rules.yml` cover L1 head stalls, derivation errors, L1 reorg signals, batcher idle, and proposer idle.

## Known constraints

- `infra/opstack/config/rollup.json` chain IDs are null in repo; `up-l2.sh` rewrites rollup genesis fields at runtime.
- Challenger overlay defaults metrics to 7303, which overlaps the sequencer metrics port; override via `L2_CHALLENGER_METRICS_HOST_PORT` when enabling challengers.
