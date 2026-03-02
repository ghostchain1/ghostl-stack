# Kubernetes Blueprints (Not Applied)

This directory contains **blueprints only** derived from Docker Compose annotations.
No manifests are applied or deployed.

## Layout

- `blueprints/statefulsets/`: stateful services (chain data, DBs).
- `blueprints/deployments/`: stateless services.
- `blueprints/services/`: Service definitions for exposed ports.
- `blueprints/configmaps/`: placeholder config maps when needed.

## Safety

- Chain services are generated with `updateStrategy: OnDelete` and `podManagementPolicy: OrderedReady`.
- No PVCs are created automatically here; templates are included in blueprints only.
