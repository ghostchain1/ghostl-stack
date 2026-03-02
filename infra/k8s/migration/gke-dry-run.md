# GKE Migration Dry-Run

This is a **dry-run analysis** only. No cloud APIs are called.

## Sizing (Estimate)

- Baseline: 3 nodes (4 vCPU / 16 GB) for control-plane and APIs.
- Chain services: dedicated node pool with local SSD or high-IO persistent disk.
- Observability: 1 node (2 vCPU / 8 GB) minimum.

## Architecture

- Prefer ARM64 if images are multi-arch.
- If any image lacks ARM64 support, use amd64 node pool for those services.

## Storage Classes

- Chain data: `pd-ssd` or regional SSD.
- Postgres/Redis: SSD-backed persistent disks.

## Network / LB

- RPC endpoints require external access via `LoadBalancer` or `Ingress`.
- UI services require `LoadBalancer` or `Ingress`.

## IAM / Identity

- Use Workload Identity for service accounts.
- No static keys in manifests.

## Migration Safety

Safe to migrate:
- Stateless UI services
- Observability (Prometheus/Grafana/Loki) if data retention is acceptable

Blocked / Manual Migration Required:
- Chain services with persistent volumes (manual data migration required)
- Postgres with existing production data (snapshot/restore required)

## Notes

- Chain data volumes must be migrated manually and validated before cutover.
- Use StatefulSet `OnDelete` for chain services to prevent auto restarts.
