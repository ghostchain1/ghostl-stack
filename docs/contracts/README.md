# Contract Diagrams

[![Contracts Cascading Finality (Fast)](https://github.com/ghostchain1/ghostl-stack/actions/workflows/contracts-cascading-fast.yml/badge.svg)](https://github.com/ghostchain1/ghostl-stack/actions/workflows/contracts-cascading-fast.yml)

Generated artifacts live in `docs/contracts/diagrams`:

- `contracts.svg` / `contracts.dot` / `contracts.md`: Surya outputs
- `architecture.mmd`: L1/L2/L3 architecture overview
- `modules.mmd`: module relationships (bridge/governance/treasury/validators)

To regenerate:

- `cd /home/ghost/ghostl-stack/contracts && npm run docs:diagrams`

## Cascading Finality Test Suite

Run the targeted hierarchical finality suite (same command used by fast CI workflow):

- `cd /home/ghost/ghostl-stack/contracts && npm run test:cascading-finality:ci`
