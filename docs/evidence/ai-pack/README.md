# GhostAI Evidence Pack

This folder captures reproducible evidence for the AI contract pack work:

- `build_logs/phase1.log` through `build_logs/phase6.log`
- `build_logs/attestor.log` for the AI attestor service discovery, wiring, and gates
- `hashes/specs.sha256` for the baseline + attestation spec docs
- `hashes/abis.sha256` for the canonical AI ABI artifacts
- `hashes/build_logs.sha256` for the phase build logs plus the attestor log
- `hashes/deployments.sha256` placeholder until deployments are generated

## Refresh Hashes

From the repo root:

```bash
sha256sum docs/ai/ATTESTATION_SPEC.md docs/ai/AI_PACK_BASELINE.md docs/ai/ATTESTOR_BASELINE.md \
  > docs/evidence/ai-pack/hashes/specs.sha256

sha256sum \
  contracts/artifacts/src/ai/AIOracleRegistry.sol/AIOracleRegistry.json \
  contracts/artifacts/src/ai/AIAttestationHub.sol/AIAttestationHub.json \
  contracts/artifacts/src/ai/PolicyGuard.sol/PolicyGuard.json \
  contracts/artifacts/src/ai/EvidenceAnchor.sol/EvidenceAnchor.json \
  contracts/artifacts/src/ai/AIAttestationTypes.sol/AIAttestationTypes.json \
  contracts/artifacts/src/ai/IRiskScoringHook.sol/IRiskScoringHook.json \
  > docs/evidence/ai-pack/hashes/abis.sha256

sha256sum docs/evidence/ai-pack/build_logs/phase{1,2,3,4,5,6}.log docs/evidence/ai-pack/build_logs/attestor.log \
  > docs/evidence/ai-pack/hashes/build_logs.sha256
```
