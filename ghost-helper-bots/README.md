# Ghost Helper Bots

Autonomous troubleshooting + remediation loop:

Analyze → Fix → Build → Verify → Remediate → Attest → Automate

## Run
```bash
cd /home/ghost/ghostl-stack/ghost-helper-bots
npm i
npm run build
npm start
```

## Outputs

- reports/: human-readable
- evidence/: machine-readable state + results
- sbom/: SBOM outputs
- attestations/: attestation outputs

Note: Bots call ops/scripts/ghostctl. Create that pipeline first.
