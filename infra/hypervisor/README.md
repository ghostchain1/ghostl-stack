# GhostStack Hypervisor Bootstrap

Single-server KVM/libvirt bootstrap for the full GhostStack federation.
Enforces the hard routing law from `AGENTS.md`:

```
GhostL3 → GhostL2 → GhostChain L1    ✅
GhostL3 → GhostChain L1              ❌  (nftables DROP)
```

---

## Files

```
infra/hypervisor/
├── ghoststack_bootstrap.sh          # Main entry point (run as root)
├── config/
│   └── ghoststack.env.example       # All tuneable settings
├── nftables/
│   └── ghoststack.nft.tpl           # nftables routing-law template + NAT
├── cloud-init/
│   └── ghost-web.yaml               # cloud-init user-data for the web VM
├── provision/
│   └── ghost-web-provision.sh       # Idempotent in-VM provisioner (run via SSH)
├── supervisor/
│   ├── Dockerfile                   # Hypervisor supervisor container
│   ├── requirements.txt
│   └── supervisor.py                # Prometheus metrics + VM health scraper
├── observability/
│   ├── docker-compose.yml           # Supervisor + Prometheus + Grafana
│   ├── prometheus/
│   │   └── prometheus.yml
│   └── grafana/
│       ├── provisioning/
│       │   ├── datasources/prometheus.yml
│       │   └── dashboards/ghoststack.yml
│       └── dashboards/
│           └── ghoststack-topology-health.json
├── GHOST_WEB_VM.md                  # Step-by-step: create + wire the ghost-web VM
├── MULTIREGION_BLUEPRINT.md         # Scale-out plan (WireGuard + nftables)
└── README.md                        # This file
```

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Ubuntu 24.04 (bare metal) | Tested on this; 22.04 works too |
| KVM/libvirt installed | `virsh list --all` should work |
| All 9 VMs **defined** in libvirt | Shut off is fine; bootstrap will start them |
| `sudo` / root access | Required |
| Internet access on host | For apt + Docker pull |

---

## Quick Start

```bash
# 1. Clone / copy this repo onto the hypervisor
cd /opt
git clone <your-repo> ghostl-stack
cd ghostl-stack/infra/hypervisor

# 2. Configure
cp config/ghoststack.env.example config/ghoststack.env
$EDITOR config/ghoststack.env      # adjust VM names, CIDRs, ports

# 3. Run (as root)
sudo bash ghoststack_bootstrap.sh
```

The script is **idempotent** — safe to re-run.

---

## What the Bootstrap Does

### 1. Install dependencies
`qemu-kvm`, `libvirt`, `nftables`, `docker`, `jq`, `curl`

### 2. Create libvirt networks

| Network | Bridge | Subnet | Purpose |
|---------|--------|--------|---------|
| `gs-l1` | `virbr10` | `10.50.10.0/24` | L1 VMs |
| `gs-l2` | `virbr20` | `10.50.20.0/24` | L2 VMs |
| `gs-l3` | `virbr30` | `10.50.30.0/24` | L3 VMs |
| `gs-mgmt` | `virbr99` | `10.50.99.0/24` | Management / SSH / metrics / **web VM** |

### 3. Apply nftables routing law

- **FORWARD L3→L2**: ✅ allowed
- **FORWARD L2→L1**: ✅ allowed
- **FORWARD L3→L1**: ❌ **DROP** (hard, non-negotiable)
- **DNAT**: public 80/443 → `ghost-web` VM (`WEB_VM_IP`)
- **MASQUERADE**: gs-mgmt egress for web VM internet access (ACME/TLS)
- Default inbound: drop (SSH from MGMT only)
- Observability ports accessible from MGMT subnet only

### 4. Start observability containers
- **Supervisor** (`:9108/metrics`) — wraps `virsh` and exposes VM state + RPC health
- **Prometheus** (`:9090`) — scrapes supervisor every 10s
- **Grafana** (`:3000`) — pre-provisioned dashboard: *GhostStack — Federation Topology & Health*

### 5. Start VMs in strict order

```
1. ghostchain-mainnet-l1   (L1 settlement)
2. ghostchain-testnet-l1
3. ghost-mainnet-validator
4. ghost-testnet-validator
5. ghost-mainnet-archive-node
─────────────────────────────
6. ghostl2-mainnet          (L2 sequencer — after L1 is up)
7. ghostl2-testnet
─────────────────────────────
8. ghostl3-mainnet          (L3 rollup — after L2 is up)
9. ghostl3-testnet
─────────────────────────────
10. ghost-web               (Web frontend — Traefik + Next.js, port 80/443)
```

> **Note:** `ghost-web` must be created in libvirt before the bootstrap will start it.
> See [GHOST_WEB_VM.md](GHOST_WEB_VM.md) for step-by-step VM creation instructions.

---

## One-Time VM NIC Wiring

> Do this **once** per VM, after running the bootstrap.

Each VM needs its NIC(s) attached to the correct network(s):

| VM | Primary Network | Optional Second NIC |
|----|-----------------|---------------------|
| `ghostchain-mainnet-l1` | `gs-l1` | `gs-mgmt` |
| `ghostchain-testnet-l1` | `gs-l1` | `gs-mgmt` |
| `ghost-mainnet-validator` | `gs-l1` | — |
| `ghost-testnet-validator` | `gs-l1` | — |
| `ghost-mainnet-archive-node` | `gs-l1` | `gs-mgmt` |
| `ghostl2-mainnet` | `gs-l2` | `gs-mgmt` |
| `ghostl2-testnet` | `gs-l2` | — |
| `ghostl3-mainnet` | `gs-l3` | `gs-mgmt` |
| `ghostl3-testnet` | `gs-l3` | — |
| `ghost-web` | `gs-mgmt` | — (internet via NAT on host) |

**Via virsh:**
```bash
virsh attach-interface ghostl2-mainnet network gs-l2 --model virtio --persistent
virsh attach-interface ghostl3-mainnet network gs-l3 --model virtio --persistent
```

**Or edit XML directly:**
```bash
virsh edit ghostl2-mainnet
# Add inside <devices>:
# <interface type="network">
#   <source network="gs-l2"/>
#   <model type="virtio"/>
# </interface>
```

---

## RPC URL Environment Variables (Inside Each VM)

Configure each VM's docker-compose or service env:

### Inside L2 VMs
```dotenv
L1_RPC_URL=http://10.50.10.<l1-dhcp-ip>:8545
```

### Inside L3 VMs
```dotenv
L2_RPC_URL=http://10.50.20.<l2-dhcp-ip>:8545
# Do NOT set L1_RPC_URL — routing law violation
```

Get DHCP IPs after boot:
```bash
virsh domifaddr ghostchain-mainnet-l1
virsh domifaddr ghostl2-mainnet
```

---

## Health Checks

```bash
# VM states
virsh list --all

# IPs
for vm in $(virsh list --name); do
  echo "$vm: $(virsh domifaddr "$vm" 2>/dev/null | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -n1)"
done

# RPC
curl -s -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"web3_clientVersion","params":[],"id":1}' \
  http://10.50.10.<L1-IP>:8545

# Confirm routing law is enforced
nft list ruleset | grep -A5 'L3.*L1'

# Confirm no L3→L1 forward rule exists
nft list chain inet ghoststack forward
```

---

## Grafana Dashboard

Open `http://<hypervisor-mgmt-ip>:3000` (admin / admin).

Navigate to: **GhostStack → GhostStack — Federation Topology & Health**

Panels:
- VMs Running count
- VMs with IP count
- RPC Healthy count
- Routing Law Edges (should always be 4)
- Per-VM health table
- VM running state over time
- RPC health over time

---

## Multi-Region Scale-Out

See [MULTIREGION_BLUEPRINT.md](./MULTIREGION_BLUEPRINT.md) for:
- Region role assignment (A=L1, B=L2, C=L3)
- WireGuard overlay mesh design
- Per-region nftables routing policy
- Federation Prometheus setup
- HA strategy and migration steps

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| VM won't start | `virsh dominfo <vm>` — disk path + network valid? |
| No IP visible | `virsh domifaddr <vm>` — NIC attached to correct network? DHCP running? |
| RPC not responding | Guest agent started? Container inside VM healthy? Port 8545 open in VM firewall? |
| L3 can't reach L2 | `nft list ruleset` — is L3→L2 FORWARD allow present? Check VM is on `gs-l3`/`gs-l2`. |
| Grafana shows no data | Supervisor container running? `docker ps`. Prometheus scraping? `:9090/targets`. |

---

*GhostStack Hypervisor Bootstrap — 2026-03-02*
*Routing law: L3 → L2 → L1 · L3 → L1 FORBIDDEN*
