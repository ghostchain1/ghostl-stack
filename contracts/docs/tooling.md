# Contract Tooling

## Toolchain versions

- Node.js: `>=22.21.0 <23` (see `contracts/package.json` engines)
- Foundry: `>=1.5.1` recommended for fuzz/invariant runs

## Solidity baseline

GhostChain Solidity Baseline: `^0.8.24` (MANDATORY)

## Formal verification hooks

- Run: `npm run verify:formal` (Hardhat model checker)
- Run: `npm run formal:slither`
- Run: `npm run formal:scribble`
- Run: `npm run formal:echidna`
- Run: `npm run formal:certora` (requires `CERTORAKEY`)

### Formal tool setup

- Slither: requires a working Docker daemon (the script runs Slither in a container). If Docker is unavailable, the runner prints `SKIPPED` and exits `0` outside CI. Set `SLITHER_STRICT=1` to fail hard (CI does this implicitly).
- Echidna: requires Docker (default) or a local `echidna-test` binary. Set `ECHIDNA_USE_DOCKER=false` to use local.
- Scribble: installed via `npm --prefix contracts ci` (uses `npx scribble`).
- Certora: install the CLI (e.g. `pip3 install certora-cli`) and set `CERTORAKEY`.

## Foundry fuzz tests

- Run: `npm run test:foundry`
- Run: `npm run test:fuzz`
- Run: `npm run test:invariant`
- Tests live under `contracts/test/foundry`.

## Contract diagrams

- Run: `npm run docs:diagrams`
- Outputs to `docs/contracts/diagrams/`:
  - `contracts.dot`
  - `contracts.md`
  - `contracts.svg` (if Graphviz `dot` is available)
  - `architecture.mmd`
  - `modules.mmd`

## One-click testnet deploy

- Run: `TESTNET_NETWORK=polygonAmoy npm run deploy:testnet`
- Or: `npm run deploy:one-click -- --layer l2 --network ghostl2`
- Output: `contracts/deployments/<network>/last_testnet_deploy.json`

## Internal note (Phase 0 snapshot)

- Enforcement hooks: `UpgradeManager.execute`, `ProposalExecutor.execute`, `AICommandCenter.executeDecision` are the execution choke points.
- Governance authority: `Governed` gates via `governor`/`timelock`; `Ownable` is used for legacy admin paths.
- Evidence pattern: `EvidenceAnchor.anchor(kind, hash, uri)` emits `EvidenceAnchored` with deterministic `hash` payloads.
