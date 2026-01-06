# Network & Chain Management Module

Pages
- Chain Overview (finality, block time, epoch)
- Fork/Reorg Monitor
- Peer Topology
- Config Viewer (read-only)

Services
- ChainStatusService (finality, reorgs, block time)
- ConsensusTelemetryService
- PeerGraphService

Data models
- ChainInfo { chainId, name, env, consensus }
- EpochInfo { epoch, round, start, end }
- ReorgEvent { depth, fromBlock, toBlock, time }

Components
- ChainOverviewCard
- ForkReorgMonitor
- PeerTopology
- ConfigViewer
