# EKS Migration Dry-Run

This is a **dry-run analysis** only. No cloud APIs are called.

## Sizing (Estimate)

- Baseline: 3 nodes (m6g.xlarge or m6i.xlarge).
- Chain services: dedicated node group with high-IO EBS (gp3/io2).
- Observability: 1 node (t3.large) minimum.

## Architecture

- ARM64 recommended when images support it.
- Mixed node groups if some images are amd64-only.

## Storage Classes

- Chain data: `gp3` with provisioned IOPS.
- Postgres/Redis: `gp3` with backups.

## Network / LB

- RPC and UI services require NLB/ALB.
- Configure security groups for RPC exposure.

## IAM / Identity

- Use IRSA for pod permissions.
- No static keys in manifests.

## Migration Safety

Safe to migrate:
- Stateless UI services
- Observability if log retention can be rebuilt

Blocked / Manual Migration Required:
- Chain services with existing data volumes
- Postgres with existing state (snapshot/restore required)

## Notes

- Validate chain data integrity after any volume migration.
- Keep docker-compose deployment until Kubernetes is proven stable.
