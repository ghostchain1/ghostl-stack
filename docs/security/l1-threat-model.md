# GhostChain L1 Threat Model

## Scope
This threat model covers GhostChain L1 infrastructure, validators, RPC ingress, governance automation, and supporting services that directly affect L1 safety.

## Assets
- Validator signing keys and JWT secrets
- L1 genesis, chain config, and consensus state
- RPC endpoints and rate-limit/auth controls
- Governance executors (Governor/ProposalExecutor/timelocks)
- CI/CD credentials and release artifacts
- Observability telemetry (logs, metrics, traces)

## Trust boundaries
- Internet-facing RPC/WS and reverse proxy
- Operator workstation / CI runners
- Vault or secret storage backend
- Container runtime / host kernel boundary
- Governance execution path (proposal -> timelock -> executor)

## Threats & Controls

### RPC abuse
- **Threats:** brute-force, spam, sensitive method exposure, resource exhaustion.
- **Controls:** RPC proxy rate limits + auth tokens, CORS/host allowlist, method allowlist, guard throttling, health checks.
- **Monitoring:** RPC error rates, rate-limit counters, AI monitor incidents, proxy metrics.

### Validator key theft
- **Threats:** key exfiltration via disk, mis-permissions, secret leakage.
- **Controls:** Vault-backed secrets, read-only mounts, least-privilege containers, key permissions (600), offline backup.
- **Monitoring:** Vault audit logs, key access alerts, unexpected validator downtime.

### Supply-chain attacks
- **Threats:** compromised dependencies, poisoned images, tampered artifacts.
- **Controls:** SBOM generation, dependency audits, container scans, provenance hashes, pinned images.
- **Monitoring:** CI scan failures, signature/provenance checks, release gate failures.

### CI credential leakage
- **Threats:** leaked tokens in logs, secrets in repo, compromised workflows.
- **Controls:** secret scanning, GitHub Actions least-privilege tokens, masked secrets, environment separation.
- **Monitoring:** gitleaks scan, audit logs, anomalous pipeline runs.

### Docker escape / host compromise
- **Threats:** container breakout, privileged escalation, host file access.
- **Controls:** cap-drop ALL, no-new-privileges, non-root UID, read-only FS where possible, isolated networks.
- **Monitoring:** host security alerts, container runtime audit logs.

### Dependency poisoning
- **Threats:** malicious packages, hijacked maintainers, typo-squatting.
- **Controls:** lockfile integrity, scoped registries, audit scans, license policy enforcement.
- **Monitoring:** npm audit alerts, CI gating on high/critical CVEs.

## Residual risk
- L1 security depends on validator operational discipline and upstream dependency integrity.
- Any compromise of governance executors can override policy controls; multi-sig and timelock coverage is mandatory.

## Incident response hooks
- Use `infra/playbooks/l1/*` for mitigation and verification.
- Escalate governance actions via ratified proposals for Tier 2/3 changes.
