# GhostAI Contract Pack — Change Log

Date: 2026-01-27
Repo root: `/home/ghost/ghostl-stack`
Mode: diff-only, non-destructive, sequential, test-gated

## Summary

This change set implements a deterministic, governance-locked AI attestation suite and integrates it into a real sensitive control path:

- Canonical EIP-712 attestation types and hashing helpers
- Governed signer registry and policy thresholds
- Attestation hub with signature, nonce, expiry, and layer checks
- Policy guard with OFF / ADVISORY / ENFORCE modes plus governance bypass
- Evidence anchoring for model cards, reports, and configs
- Integration into `SlashingManager.setFeePolicy`
- SDK typed-data helpers and golden vector tests
- Minimal AI contract pack UI panel and ABI/address discovery route
- Evidence pack with hashes and build logs

## New Files (with Justification)

- `contracts/src/ai/AIAttestationTypes.sol`: Canonical shared struct definitions, typehashes, and digest helpers to prevent drift across contracts and SDK.
- `contracts/src/ai/AIOracleRegistry.sol`: Governed signer allowlist and policy threshold storage required for deterministic on-chain enforcement.
- `contracts/src/ai/AIAttestationHub.sol`: Append-only attestation verification and storage hub with replay protection and layer enforcement.
- `contracts/src/ai/PolicyGuard.sol`: Governance-controlled enforcement adapter that gates sensitive actions without granting unilateral AI control.
- `contracts/src/ai/EvidenceAnchor.sol`: Court-ready evidence anchoring of model cards, reports, and configuration hashes.
- `contracts/src/ai/IRiskScoringHook.sol`: Standardized read interface for risk scoring used by services and UI.
- `contracts/test/foundry/AIAttestationSpec.t.sol`: Golden vector hash test to prove Solidity typehash/digest alignment with the documented spec.
- `contracts/test/foundry/AIAttestationHubPolicyGuard.t.sol`: Contract-level tests for signature verification, nonce replay prevention, expiry enforcement, and guard modes.
- `contracts/test/foundry/SlashingManagerPolicyGuard.t.sol`: End-to-end sensitive-path test showing ENFORCE blocks high risk, allows low risk, and governance bypass succeeds.
- `packages/sdk/src/ai/attestations.ts`: Canonical TS EIP-712 domain/struct helpers with golden vector support and nonce helpers.
- `packages/sdk/scripts/attestations.golden.ts`: Golden vector script that verifies typehashes, domain separator, struct hash, and digest.
- `docs/ai/AI_PACK_BASELINE.md`: Repository discovery baseline documenting governance wiring, toolchain, and the chosen sensitive integration path.
- `docs/ai/ATTESTOR_BASELINE.md`: Attestor discovery baseline documenting service conventions and compose integration intent.
- `docs/ai/ATTESTATION_SPEC.md`: Authoritative attestation spec matching both Solidity and TS implementations.
- `apps/web/app/api/ai/contracts/route.ts`: Repo-aware ABI and address discovery endpoint used by the AI UI panel.
- `docs/diagrams/ai-attestation-flow.mmd`: Mermaid diagram of the off-chain attestation and on-chain enforcement flow.
- `docs/diagrams/ai-governance-control-loop.mmd`: Mermaid diagram of the governance control loop and override guarantees.
- `docs/evidence/ai-pack/README.md`: Evidence pack overview and the exact commands to refresh hashes.
- `docs/evidence/ai-pack/hashes/specs.sha256`: Hashes for baseline and attestation spec docs.
- `docs/evidence/ai-pack/hashes/abis.sha256`: Hashes for canonical AI ABI artifacts used by the UI/API.
- `docs/evidence/ai-pack/hashes/build_logs.sha256`: Hashes for phase build logs.
- `docs/evidence/ai-pack/hashes/deployments.sha256`: Explicit placeholder documenting that deployments JSONs were not generated in this phase.
- `docs/evidence/ai-pack/build_logs/phase1.log`: Phase 1 discovery and toolchain gating log.
- `docs/evidence/ai-pack/build_logs/phase2.log`: Phase 2 attestation spec and golden vector gating log.
- `docs/evidence/ai-pack/build_logs/phase3.log`: Phase 3 contract suite and test gating log.
- `docs/evidence/ai-pack/build_logs/phase4.log`: Phase 4 sensitive-path integration gating log.
- `docs/evidence/ai-pack/build_logs/phase5.log`: Phase 5 ABI export, UI wiring, and build gating log.
- `docs/evidence/ai-pack/build_logs/phase6.log`: Phase 6 diagrams, evidence hashing, and final gating log.

## Modified Files (with Reason)

- `contracts/src/l1/SlashingManager.sol`: Integrated `PolicyGuard.enforcePolicy(...)` into `setFeePolicy` and added explicit governance override `setFeePolicyBypass(...)`.
- `packages/sdk/src/index.ts`: Exported the new AI attestation helpers from the SDK entrypoint.
- `contracts/artifacts/src/ai/AIOracleRegistry.sol/AIOracleRegistry.json`: Canonical ABI for UI/API discovery.
- `contracts/artifacts/src/ai/AIAttestationHub.sol/AIAttestationHub.json`: Canonical ABI for UI/API discovery.
- `contracts/artifacts/src/ai/PolicyGuard.sol/PolicyGuard.json`: Canonical ABI for UI/API discovery.
- `contracts/artifacts/src/ai/EvidenceAnchor.sol/EvidenceAnchor.json`: Canonical ABI for UI/API discovery.
- `contracts/artifacts/src/ai/AIAttestationTypes.sol/AIAttestationTypes.json`: Canonical ABI for UI/API discovery.
- `contracts/artifacts/src/ai/IRiskScoringHook.sol/IRiskScoringHook.json`: Canonical ABI for UI/API discovery.
- `apps/web/src/modules/ai/AiCommandCenter.tsx`: Added an AI Contract Pack read panel that loads signers, policies, guard mode, latest risk, and evidence anchors.
- `apps/web/app/compliance/transparency/page.tsx`: Fixed incorrect relative imports that blocked Next.js builds.
- `apps/web/app/api/explorer/[chain]/[[...path]]/route.ts`: Updated route handler signature to match Next.js 15 route typing expectations.
- `apps/web/next.config.js`: Added a safe `distDir` override to avoid permission issues with root-owned build artifacts.
- `apps/web/tsconfig.json`: Stabilized `include`/`exclude` to avoid typechecking stale Next build artifacts.
- `.gitignore`: Ignored `apps/web/.next-codex/`, `apps/web/.next-ghost/`, and `apps/web/.next-local-*/` build artifacts.

## Reproduce Commands (Test Gates)

Run from repo root unless noted.

Contracts gate:

```bash
cd contracts
forge build
forge test
```

ABI export gate (canonical artifacts used by the UI/API):

```bash
cd /home/ghost/ghostl-stack
forge build --root contracts

mkdir -p contracts/artifacts/src/ai/AIOracleRegistry.sol
mkdir -p contracts/artifacts/src/ai/AIAttestationHub.sol
mkdir -p contracts/artifacts/src/ai/PolicyGuard.sol
mkdir -p contracts/artifacts/src/ai/EvidenceAnchor.sol
mkdir -p contracts/artifacts/src/ai/AIAttestationTypes.sol
mkdir -p contracts/artifacts/src/ai/IRiskScoringHook.sol

cp contracts/out-codex/AIOracleRegistry.sol/AIOracleRegistry.json contracts/artifacts/src/ai/AIOracleRegistry.sol/AIOracleRegistry.json
cp contracts/out-codex/AIAttestationHub.sol/AIAttestationHub.json contracts/artifacts/src/ai/AIAttestationHub.sol/AIAttestationHub.json
cp contracts/out-codex/PolicyGuard.sol/PolicyGuard.json contracts/artifacts/src/ai/PolicyGuard.sol/PolicyGuard.json
cp contracts/out-codex/EvidenceAnchor.sol/EvidenceAnchor.json contracts/artifacts/src/ai/EvidenceAnchor.sol/EvidenceAnchor.json
cp contracts/out-codex/AIAttestationTypes.sol/AIAttestationTypes.json contracts/artifacts/src/ai/AIAttestationTypes.sol/AIAttestationTypes.json
cp contracts/out-codex/IRiskScoringHook.sol/IRiskScoringHook.json contracts/artifacts/src/ai/IRiskScoringHook.sol/IRiskScoringHook.json
```

SDK golden vector gate:

```bash
npx --no-install ts-node --esm packages/sdk/scripts/attestations.golden.ts
```

Web gates:

```bash
cd apps/web
NEXT_DIST_DIR=.next-local-$(date +%s) npm run build
npx --no-install tsc --noEmit -p tsconfig.json
```

Evidence hash refresh:

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

sha256sum docs/evidence/ai-pack/build_logs/phase{1,2,3,4,5,6}.log \
  > docs/evidence/ai-pack/hashes/build_logs.sha256
```

## Notes and Limits

- No deployment JSONs were generated in this phase. The evidence pack includes an explicit placeholder at `docs/evidence/ai-pack/hashes/deployments.sha256`.
- The AI UI panel reads from the configured RPC endpoints and requires contract addresses. It will auto-fill from deployment JSONs once those exist.

## AI Attestor Service Add-On (2026-01-27)

This add-on introduces a deterministic, dockerized AI attestor service and wires it into the existing AI control surface without altering chain state.

### New Files (with Justification)

- `services/ghost-ai-attestor/package.json`: Self-contained service dependencies and scripts aligned with existing service conventions.
- `services/ghost-ai-attestor/tsconfig.json`: Strict NodeNext TypeScript configuration matching the repo’s Node 22 baseline.
- `services/ghost-ai-attestor/src/config.ts`: Centralized, validated configuration with per-layer RPC and contract address wiring plus safe defaults.
- `services/ghost-ai-attestor/src/nonceStore.ts`: Restart-safe, persisted nonce tracking to prevent replay and nonce drift across restarts.
- `services/ghost-ai-attestor/src/attestation.ts`: Canonical EIP-712 type strings, typehashes, domain/struct/digest helpers, and a golden vector to prevent spec drift.
- `services/ghost-ai-attestor/src/riskEngine.ts`: Deterministic, rule-based risk engine stub that produces stable inputs/outputs and hashes without on-chain inference.
- `services/ghost-ai-attestor/src/signer.ts`: Wallet + payload construction and signing utilities that enforce bytes32 references and canonical attestation IDs.
- `services/ghost-ai-attestor/src/hubClient.ts`: Minimal on-chain client for AIOracleRegistry and AIAttestationHub with policy reads, allowlist checks, nonces, and submissions.
- `services/ghost-ai-attestor/src/server.ts`: Express HTTP API implementing `/healthz`, `/config`, `/risk/:subject`, and `/attest` with rate limiting and governance-safe constraints.
- `services/ghost-ai-attestor/test/attestation.test.ts`: Golden vector test that proves the service’s typed-data hashing matches the canonical spec constants.
- `services/ghost-ai-attestor/test/nonceStore.test.ts`: Nonce persistence test that verifies the on-disk nonce store survives reloads.
- `services/ghost-ai-attestor/entrypoint.sh`: Service entrypoint consistent with existing service patterns and compatible with ts-node runtime execution.
- `services/ghost-ai-attestor/healthcheck.sh`: Healthcheck script aligned with existing `/health` conventions and the new `/healthz` endpoint.
- `services/ghost-ai-attestor/Dockerfile`: Dockerized runtime that installs full deps (ts-node included) and uses the standard Node 22 Alpine base.
- `services/ghost-ai-attestor/docker-compose.yml`: Per-service compose file enabling targeted, non-destructive local runs on the existing `ghost_net`.
- `docs/evidence/ai-pack/build_logs/attestor.log`: Evidence log capturing discovery, compile/test gates, compose validation, and UI gates for the attestor add-on.

### Modified Files (with Reason)

- `docs/ai/ATTESTOR_BASELINE.md`: Updated the compose overlay build context to the correct relative path and reflected concrete discovery results.
- `infra/docker/compose/docker-compose.ai.yml`: Added the `ghost-ai-attestor` service, its environment wiring, and a named volume for nonce persistence.
- `infra/docker/compose/stack.env`: Added attestor-specific environment placeholders so the AI overlay can render without missing keys.
- `services/stack.env.example`: Added attestor configuration variables to the shared stack template without altering live stack state.
- `apps/web/src/lib/runtime.ts`: Added `resolveAiAttestorBase()` using existing service URL resolution patterns.
- `apps/web/src/modules/ai/AiCommandCenter.tsx`: Added an AI Attestor Service panel with status, risk reads, and attestation submission hooks.
- `apps/web/.env.local.example`: Added `NEXT_PUBLIC_AI_ATTESTOR_URL` and `AI_ATTESTOR_URL` for local UI wiring.
- `apps/web/.env.example`: Added `NEXT_PUBLIC_AI_ATTESTOR_URL` and `AI_ATTESTOR_URL` for shared env documentation.
- `apps/web/tsconfig.json`: Removed a build-generated `.next-local-*` include entry to keep typechecking stable and non-destructive.
- `docs/evidence/ai-pack/README.md`: Included `attestor.log` in the evidence pack description and hash refresh commands.

### Reproduce Commands (Attestor Gates)

Run from repo root unless noted.

Attestor service gates:

```bash
cd services/ghost-ai-attestor
npm install
npm run check
npm run test
```

Contracts regression gate:

```bash
cd contracts
forge test
```

AI overlay compose validation (non-destructive):

```bash
docker compose -f infra/docker/compose/docker-compose.ai.yml config --no-interpolate
```

Web typecheck gate:

```bash
cd apps/web
npx --no-install tsc --noEmit -p tsconfig.json
```

Note: `next build` may inject `.next-local-*` paths into `apps/web/tsconfig.json`. If that happens, remove the injected include entry and re-run the typecheck gate above.
