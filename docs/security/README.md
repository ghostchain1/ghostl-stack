# Security Docs

- `l1-threat-model.md`: L1 threat model and controls.
- `l1-hardening-checklist.md`: Hardening checklist for L1 ops.
- `l1-invariants.md`: Formal L1 invariants and enforcement map.
- `ssh-onchain-notary.md`: SSH notarization workflow.

## Scanning configuration

- Gitleaks uses `.gitleaks.toml` for allowlisting non-secret on-chain addresses and generated paths.
- Semgrep uses `scripts/security/semgrep.yml` for baseline SAST rules (expand as needed).
- Trivy CI scans L1+L2+L3 for vulnerabilities and secrets.
- `trivy-secret.yaml` defines allow rules for large generated artifacts.
