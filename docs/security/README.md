# Security Docs

- `l1-threat-model.md`: L1 threat model and controls.
- `l1-hardening-checklist.md`: Hardening checklist for L1 ops.
- `l1-invariants.md`: Formal L1 invariants and enforcement map.
- `l2-threat-model.md`: L2 threat model and controls.
- `l2-hardening-checklist.md`: Hardening checklist for L2 ops.
- `l2-invariants.md`: Formal L2 invariants and enforcement map.
- `ai-governance-invariants.yaml`: Machine-readable invariants registry for AI governance primitives.
- `ssh-onchain-notary.md`: SSH notarization workflow.

## Scanning configuration

- Gitleaks uses `.gitleaks.toml` for allowlisting non-secret on-chain addresses and generated paths.
- Semgrep uses `scripts/security/semgrep.yml` for baseline SAST rules (expand as needed).
- Trivy CI scans the tracked repo for secrets and runs nightly filesystem scans for vuln/secret/misconfig.
- `trivy-secret.yaml` defines Trivy secret-scanner allow rules for generated/large artifacts (loaded by default, or via `--secret-config trivy-secret.yaml`).
- For faster scans, use `--skip-dirs` / `--skip-files` (see `ops/scripts/scan.sh` and `infra/scripts/gates/l1-go-no-go.sh`).
- Local scan runner: `bash ops/scripts/scan.sh` (writes `ops/security/trivy-fs.json`).
