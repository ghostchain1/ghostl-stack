# Ghost L2 Threat Model

## Scope
This threat model covers Ghost L2 (OP Stack) infrastructure, rollup services, batcher/proposer, L1 anchoring, bridge flows, and AI governance controls that impact L2 safety.

## Assets
- Sequencer, batcher, proposer, challenger keys and JWT secrets
- L2 genesis/rollup config, L1 deployment addresses, chain IDs
- L1 anchoring outputs (L2OutputOracle / DisputeGameFactory)
- Bridge contracts (L1StandardBridge, CrossDomainMessenger, L1ERC721Bridge)
- RPC endpoints (L2 execution + op-node)
- AI policy registry and guard control plane
- CI/CD credentials and release artifacts

## Trust boundaries
- Internet-facing L2 RPC / WS and reverse proxies
- L1 RPC ingress (op-node + batcher/proposer dependency)
- Vault / secret storage backend
- Container runtime / host kernel boundary
- Governance execution path (proposal -> timelock -> executor)

## Threats & Controls

### Sequencer/batcher abuse
- **Threats:** censorship, delayed batches, invalid data submission, key misuse.
- **Controls:** guarded RPC proxy, rate limits, AI monitor classification, governance-locked policy registry.
- **Monitoring:** batcher idle metrics, op-node derivation lag, AI incident signals.

### L1 anchoring failures
- **Threats:** stalled output oracle, L1 reorg desync, stale L1 RPC.
- **Controls:** L1 head lag checks, output oracle monitors, proposer lag alerts, retry logic.
- **Monitoring:** op-node sync status, L1 head timestamp lag, proposer publish metrics.

### Bridge exploits
- **Threats:** invalid messages, replay, unauthorized bridge mint/burn.
- **Controls:** canonical contract registry, governance gating, audit of bridge contracts.
- **Monitoring:** bridge event anomalies, contract registry checks, AI monitor incidents.

### Gas token drift
- **Threats:** ETH/invalid token used as gas, token mismatch across layers.
- **Controls:** canonical GHOST token enforcement in deploy scripts, doctor checks.
- **Monitoring:** config checksums, gas token telemetry, governance enforcement.

### Supply-chain attacks
- **Threats:** poisoned dependencies, malicious containers, compromised build scripts.
- **Controls:** dependency audits, SBOM generation, container scanning, lockfile integrity.
- **Monitoring:** CI gate failures, vulnerability reports, provenance hashes.

### Secrets exposure
- **Threats:** keys in repo, leaked env, over-permissive file mounts.
- **Controls:** Vault-backed secrets, read-only mounts, secret scanning.
- **Monitoring:** gitleaks + trivy secret scans, Vault audit logs.

### Governance bypass
- **Threats:** AI actions executed without policy approval, unauthorized upgrades.
- **Controls:** L1 policy registry (`AgentGovernancePolicy`), doctor-l2 gate, timelock/multisig for Tier 3.
- **Monitoring:** policy registry allow/deny telemetry, governance service logs.

## Residual risk
- L2 safety depends on L1 finality and governance discipline.
- L1 RPC availability remains a critical dependency for op-node and batcher/proposer.

## Incident response hooks
- Use `infra/playbooks/l2/*` for mitigation and verification.
- Escalate governance actions via L1 proposals for Tier 2/3 changes.
