# Confidential Compute Attestation (CCA)

This directory captures a best-effort confidential compute attestation for SEV/TDX capable hosts.

Artifacts (generated at runtime):
- `cca.json`

Generate:
```
./ops/confidential/collect-cca.sh --out ./ops/confidential/cca.json
```

If SEV/TDX capabilities are unavailable, the script emits `supported=false` with a reason.
