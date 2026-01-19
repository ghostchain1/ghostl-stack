# Contract Tooling

## Formal verification hooks

- Run: `npm run verify:formal` (Hardhat model checker)
- Run: `npm run formal:slither`
- Run: `npm run formal:scribble`
- Run: `npm run formal:echidna`
- Run: `npm run formal:certora` (requires `CERTORAKEY`)

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
