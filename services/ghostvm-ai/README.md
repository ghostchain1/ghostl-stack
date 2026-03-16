# GhostNetSync AI (ghostvm-ai)

GhostNetSync AI provides a separate, governance-gated, network control plane for:

- Hypervisor (libvirt/bridges/nftables)
- VM networking (netplan/systemd-networkd + nftables)
- Docker networking (bridge/overlay/macvlan/ipvlan discovery + planning)
- Continuous desired-state reconciliation with drift detection

It is safe-by-default:

- Default mode is dry-run (`GNS_APPLY_ENABLED=false`)
- Destructive actions require signed governance approvals
- Routing law enforcement is validated before plan/apply

## Commands

- `python3 ghostnetsync.py discover`
- `python3 ghostnetsync.py plan`
- `python3 ghostnetsync.py apply --dry-run`
- `python3 ghostnetsync.py verify`
- `python3 ghostnetsync.py rollback --plan-id <id>`
- `python3 ghostnetsync.py status`

## API

Run:

```bash
uvicorn api.main:app --host 0.0.0.0 --port 8099
```

Endpoints:

- `GET /health`
- `GET /metrics`
- `POST /discover`
- `POST /plan`
- `POST /apply`
- `POST /verify`
- `POST /rollback`
- `GET /status`

## Config

- `config/network-desired-state.yaml`
- `config/routing-policy.yaml`

The live external block currently configured:

- CIDR: `38.247.149.0/24`
- Gateway: `38.247.149.1`
- Primary alias: `38.247.149.218`
- Canonical devnet control IP: `38.247.149.219`

## Tests

```bash
python3 -m pip install -r requirements.txt
PYTHONPATH=. pytest -q
```
