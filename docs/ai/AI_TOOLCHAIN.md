# AI Toolchain (Constitution-Compliant)

This repo is **model-locked** for critical work:

- **Primary Model (architecture/security/governance):** `GPT-5.2 Thinking`
- **Execution Model (code diffs/infra changes):** `GPT-5.2` in **Codex-style execution posture**

See:

- Article X draft: `docs/ghostchain/charter_v1_1_draft.md`
- On-chain model lock: `docs/ai-core/model-lock.md`

## What Counts As “Critical”

Treat these as **critical** (must follow model lock + evidence rules):

- Consensus, execution client changes, genesis/chain parameters
- L1↔L2↔L3 bridging and cross-domain messaging
- Key management, signer plumbing, Vault/KMS flows
- Governance, treasury, upgrade authority, timelock/executor wiring
- Security controls, incident response, compliance/evidence ledger logic

## Allowed Tooling (Recommended)

Use these as the default stack for GhostChain + OP Stack development:

- **AI models:** `GPT-5.2 Thinking` (design) + `GPT-5.2 Codex` (diff-only implementation)
- **Solidity/OP Stack correctness:** Foundry, Hardhat, `forge test`, `cast`, `anvil`
- **Static analysis:** Slither, Semgrep (Solidity rulesets)
- **Fuzzing/invariants:** Foundry invariant tests, Echidna (where it adds value)
- **Supply chain/security:** Trivy (vuln/secret/misconfig), gitleaks
- **Runtime validation:** repo doctor scripts + E2E smoke tests under `scripts/` and `infra/scripts/`

## Non-Approved / Limited-Use Tools

Tools like **Copilot**, **ChainGPT**, **Workik**, **Replit**, or any third-party “AI auditor”:

- MAY be used for **non-critical** tasks only (e.g., documentation formatting, UI copy).
- MUST NOT be used for critical decisions, protocol logic, bridge logic, keys/secrets, or governance.
- MUST NOT receive secrets, private keys, JWTs, `.env` contents, or internal incident data.

If you use any auxiliary tool at all, record it in your evidence package (prompt/input hash + outputs).

## Operational Workflow (Practical)

1. **Architect (GPT-5.2 Thinking)**: define invariants + acceptance checks.
2. **Executor (GPT-5.2 Codex)**: implement minimal diffs; no destructive rewrites.
3. **Auditor**: re-run tests/scans; treat changes as adversarial.
4. **Governor**: produce deterministic proposal calldata + evidence references.

## CI Gates (What We Enforce)

- **Secret scanning:** CI blocks merges when Trivy secret scanning detects committed secrets.
- **No tracked secrets:** `.env`, key material, JWT secrets, backups/snapshots are expected to be untracked (see `.gitignore` and the `.example` templates).
- **AI governance go/no-go:** scheduled/tag gate validates governance artifacts and evidence-pack reproducibility (`infra/scripts/gates/ai-go-no-go.sh`).

