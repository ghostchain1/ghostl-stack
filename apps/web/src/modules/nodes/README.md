# Node Operations Module

Pages
- Nodes List
- Node Detail (health, logs, metrics)
- Upgrades & Version Drift
- Snapshots / Pruning

Services
- NodeInventoryService
- NodeHealthService
- UpgradeOrchestratorService
- SnapshotService

Data models
- Node { id, type, host, version, status, lastSeenAt }
- NodeMetrics { cpu, mem, disk, iops, peers, lag }

Components
- NodesList
- NodeDetail
- UpgradePlanner
- SnapshotPanel
