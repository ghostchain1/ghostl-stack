# GhostControl Trivy Profiles

Profiles are declarative scan presets consumed by GhostLoop and operators.

Run examples:

```bash
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL --ignore-unfixed --format json --output /home/ghost/ghostl-stack/tools/ghostcontrol/evidence/scans/trivy-l1.json /home/ghost/ghostl-stack/infra/ghostchain
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL --ignore-unfixed --format json --output /home/ghost/ghostl-stack/tools/ghostcontrol/evidence/scans/trivy-l2.json /home/ghost/ghostl-stack/infra/opstack
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL --ignore-unfixed --format json --output /home/ghost/ghostl-stack/tools/ghostcontrol/evidence/scans/trivy-l3.json /home/ghost/ghostl-stack/infra/opstack/l3
trivy fs --scanners vuln,misconfig,secret --severity MEDIUM,HIGH,CRITICAL --ignore-unfixed --format json --output /home/ghost/ghostl-stack/tools/ghostcontrol/evidence/scans/trivy-infra.json /home/ghost/ghostl-stack/tools/ghostcontrol/infra
```

Image gate with expiring allowlist:

```bash
cd /home/ghost/ghostl-stack/tools/ghostcontrol
bash security/trivy/scan-images.sh compose-ghostcontrol-api compose-ghostcontrol-ui
```

This command writes:

- per-image trivy JSON reports under `/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/scans/`
- gate summary JSON at `/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/scans/ghostcontrol-image-gate-summary.json`

Secret gate with expiring allowlist:

```bash
cd /home/ghost/ghostl-stack/tools/ghostcontrol
bash security/trivy/scan-secrets.sh /home/ghost/ghostl-stack/tools/ghostcontrol
```

This command writes:

- secret scan JSON report at `/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/scans/ghostcontrol-secret-scan.json`
- gate summary JSON at `/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/scans/ghostcontrol-secret-gate-summary.json`
