# GhostStack Multi-Region Deployment Blueprint
## Routing Law: L3 → L2 → L1 (non-negotiable, from AGENTS.md)

---

## Overview

This document describes how to scale GhostStack from a single KVM hypervisor
to a multi-region federation while preserving the hard routing law:

```
GhostL3  →  GhostL2  →  GhostChain L1
   ↑
   └─── NO direct L3 → L1 path, ever.
```

---

## Region Role Assignment

| Region | Role | Layers Hosted | Connectivity |
|--------|------|---------------|-------------|
| **Region A** | Settlement / Governance | L1 mainnet, validators, archive, Treasury/governance services | Public RPC (optional, gated), internal overlay |
| **Region B** | Liquidity / Exchange | L2 mainnet sequencer + replicas, bridge adapters (L2↔L1 only), indexers | Internal overlay only |
| **Region C** | Utility / Apps | L3 mainnet sequencer + app services, consumer-facing APIs | Internal overlay + public gateway (app-layer only) |

---

## WireGuard Overlay (Inter-Region)

All regions are connected via a **full-mesh WireGuard overlay**.

### Overlay Subnets

| Network | CIDR | Description |
|---------|------|-------------|
| Region A L1 overlay | `10.200.10.0/24` | L1 VMs in Region A |
| Region B L2 overlay | `10.200.20.0/24` | L2 VMs in Region B |
| Region C L3 overlay | `10.200.30.0/24` | L3 VMs in Region C |

### WireGuard Config Template (Region C → Region B example)

```ini
# /etc/wireguard/wg-gs-overlay.conf  (on Region C host)
[Interface]
Address    = 10.200.30.1/24
PrivateKey = <region-c-private-key>
ListenPort = 51820

# Region B (L2)
[Peer]
PublicKey  = <region-b-public-key>
Endpoint   = <region-b-public-ip>:51820
AllowedIPs = 10.200.20.0/24

# Region A (L1) — Region C reaches L1 only via Region B at the app layer
# Direct WG tunnel to Region A exists for admin/mgmt ONLY (not RPC)
[Peer]
PublicKey  = <region-a-public-key>
Endpoint   = <region-a-public-ip>:51820
AllowedIPs = 10.200.10.0/24
```

> **Note:** Routing policy on Region C host MUST drop L3 traffic destined for
> `10.200.10.0/24` (L1 overlay). Only management traffic (admin SSH, metrics)
> is permitted from Region C to Region A. The WireGuard tunnel exists for
> operational access; RPC routing is enforced at the nftables level separately.

---

## Border Firewall Policy (each region)

Identical routing law applied at each region's nftables:

```
# Region C border
Allow:  10.200.30.0/24 (L3) → 10.200.20.0/24 (L2)
Deny:   10.200.30.0/24 (L3) → 10.200.10.0/24 (L1)   # HARD DROP

# Region B border
Allow:  10.200.20.0/24 (L2) → 10.200.10.0/24 (L1)
```

The [single-server nftables template](../nftables/ghoststack.nft.tpl) is
applied with region-specific CIDR substitutions on each host.

---

## RPC URL Configuration (Inside Each VM)

### L2 Sequencer (Region B)
```dotenv
L1_RPC_URL=http://10.200.10.<l1-mainnet-vm-ip>:8545
```

### L3 Sequencer (Region C)
```dotenv
L2_RPC_URL=http://10.200.20.<l2-mainnet-vm-ip>:8545
# L1_RPC_URL must NOT be set directly — violation of routing law
```

---

## Public Exposure Model

| Service | Exposed? | Method |
|---------|----------|--------|
| L1 mainnet RPC | Optional | Nginx + auth header + rate limit on Region A edge |
| L2 sequencer RPC | No (default) | Internal only; behind gateway if needed for partner integrations |
| L3 app endpoints | Yes | Public Traefik/Nginx on Region C; routes to L3 only |
| Grafana / Prometheus | No | MGMT subnet only (WireGuard admin access) |

---

## High Availability

### L1
- N validators spread across Region A (primary quorum) and optionally Region B (observers).
- Constitutional quorum anchored in Region A initially.
- Archive node stays in Region A for data locality.

### L2
- Active-passive sequencer: primary in Region B, standby replica in Region A.
- Leader election via health check + DNS failover.

### L3
- Sequencer in Region C; replica in Region B (optional).
- Consumer-facing apps horizontally scaled in Region C.

---

## Observability (Multi-Region)

Each region runs its own local Prometheus + Grafana stack (from
`infra/hypervisor/observability/`). A central Prometheus in Region A uses
[federation](https://prometheus.io/docs/prometheus/latest/federation/) to
aggregate key metrics:

```yaml
# Central Prometheus — Region A
scrape_configs:
  - job_name: "federate-region-b"
    honor_labels: true
    metrics_path: /federate
    params:
      match[]:
        - '{job="ghoststack-supervisor"}'
    static_configs:
      - targets: ["10.200.20.1:9090"]  # Region B Prometheus

  - job_name: "federate-region-c"
    honor_labels: true
    metrics_path: /federate
    params:
      match[]:
        - '{job="ghoststack-supervisor"}'
    static_configs:
      - targets: ["10.200.30.1:9090"]  # Region C Prometheus
```

---

## Security

- Mutual TLS between region gateways (use `step-ca` or Let's Encrypt).
- Signed config bundles with SLSA provenance before deploying contract changes.
- Vault primary in Region A; regional secondaries in B and C (read replicas).
- Key rotation automated via Vault Agent Injector in each region's Docker stack.
- No private keys or secrets in environment variables — use Vault dynamic secrets.

---

## Migration: Single-Server → Multi-Region

1. **Establish WireGuard overlay** between all three region hosts.
2. **Apply routing law nftables** on each region host (same template, different CIDRs).
3. **Move L3 workloads to Region C** — update `L2_RPC_URL` to point at Region B overlay IP.
4. **Move L2 sequencer to Region B** — update `L1_RPC_URL` to point at Region A overlay IP.
5. **Keep L1 anchored in Region A** — expand validators gradually without touching routing law.
6. **Stand up federated Prometheus** in Region A.
7. **Run health checks** from all three regions and confirm no L3→L1 traffic in firewall logs.

---

## Quick Reference: Environment Variables Per Layer

| Variable | Set Where | Points At |
|----------|-----------|-----------|
| `L1_RPC_URL` | L2 VM docker-compose.yml | L1 internal/overlay IP |
| `L2_RPC_URL` | L3 VM docker-compose.yml | L2 internal/overlay IP |
| `L1_RPC_URL` | **NOT set in L3 VMs** | — (routing law) |

---

*Blueprint version: 2026-03-02. Follows AGENTS.md routing law.*
