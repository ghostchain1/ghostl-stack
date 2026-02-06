# Phase 5 — Security & Compliance

Phase 5 turns the Phase 2–4 primitives into an auditable, test-gated system by enforcing:

- **No critical vulnerabilities** (static analysis + fuzz/invariant tests).
- **Least-privilege hygiene** (secrets scanning + misconfig scanning).
- **Deterministic evidence artifacts** suitable for auditors/regulators.

## Contract security gates

Run from repo root:

```bash
cd contracts
forge test
```

Static analysis (Slither, compiled offline from fresh Foundry build-info):

```bash
cd contracts
node -r ts-node/register scripts/run_slither.ts
```

- Output: `contracts/reports/formal/slither.json`
- Gate policy: **block** on `High`, and on `Medium` except `unused-return` (tracked but non-blocking).
- Build isolation: `contracts/out-slither/` + `contracts/cache-slither/` (ignored; excluded from Trivy scans).

Scribble instrumentation (formal assertions):

```bash
cd contracts
node -r ts-node/register scripts/run_scribble.ts
```

- Output: `contracts/reports/formal/scribble/scribble.json`

## Repo/container scan gate

Filesystem vuln/secret/misconfig scan (HIGH/CRITICAL severity gate):

```bash
bash ops/scripts/scan.sh
```

- Output: `ops/security/trivy-fs.json` (generated; not committed).

## Invariants (examples)

- **Treasury reserve + budget:** enforced by `TreasuryPolicy.validateAction(...)` and `TreasuryPolicy.consumeBudget(...)`, backed by Foundry invariant tests in `contracts/test/invariants/Treasury.invariant.t.sol` and the spec in `docs/treasury/Treasury_Invariants_Math.md`.
- **Governance non-bypassable execution:** privileged mutations flow through `LowBalancerGovernor -> ProposalExecutor` with constitutional/evidence guards, and all configuration registries are `onlyGovernance` (see `docs/architecture/phase4-governance.md`).
- **AI cannot override governance:** AI services propose and attest; on-chain execution requires quorum, evidence, and executor authorization (see `docs/architecture/ghostchain-ai-governance-whitepaper.md`).

## Decision log (Phase 5)

- Slither runs against **fresh build-info** each time to prevent “source out-of-sync” false results.
- `unused-return` findings are non-blocking because they are dominated by tuple unpacking and bytes-return ignores; security-relevant ignored ERC20 returns remain blocked by policy (they would surface as `unused-return` on token `transfer*` calls, which are already `require(...)`-checked in core paths).
