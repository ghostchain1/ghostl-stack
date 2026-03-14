# GhostStack Autonomy Inventory

Generated: 2026-02-04T02:23:32Z

## Repo layout
- .dockerignore
- .env
- .env.example
- .gitattributes
- .github/
- .gitignore
- .gitleaks.toml
- .gitmodules
- .nvmrc
- .prettierignore
- .prettierrc
- .vscode/
- LICENSE
- README.md
- README_COMPLIANCE.md
- TREASURY_CONSTITUTION.md
- alloc_merged.json
- apps/
- artifacts/
- backups/
- cache/
- chains/
- contracts/
- core-service/
- dev-stack.sh
- dist/
- docker-compose.agents.yml
- docker-compose.dev.yml
- docker-compose.yml
- docs/
- ecosystem.config.cjs
- eslint.config.mjs
- ghostl-stack.code-workspace
- infra/
- license-report.json
- observability/
- ops/
- package-lock.json
- package.json
- packages/
- scripts/
- services/
- tmp-deploy-l3.js
- tree.txt
- trivy-secret.yaml
- tsconfig.base.json
- update-report.json
- update-report.md

## Tooling detected (by file presence)
- foundry
  - contracts/compliance/foundry.toml
  - contracts/foundry.toml
  - contracts/lib/forge-std/foundry.toml
  - infra/opstack/foundry.toml
  - infra/opstack/optimism-upstream/op-chain-ops/foundry/testdata/srcmaps/foundry.toml
  - infra/opstack/optimism-upstream/op-chain-ops/script/testdata/foundry.toml
  - infra/opstack/optimism-upstream/op-e2e/e2eutils/interop/contracts/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/forge-std/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/lib/forge-std/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/prb-test/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/forge-std/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/lib/forge-std/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/lib/solady/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/lib/forge-std/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solady-v0.0.245/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solady/foundry.toml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solmate/foundry.toml
  - infra/opstack/optimism/op-chain-ops/foundry/testdata/srcmaps/foundry.toml
  - infra/opstack/optimism/op-chain-ops/script/testdata/foundry.toml
  - infra/opstack/optimism/op-deployer/pkg/deployer/forge/testdata/testproject/foundry.toml
  - infra/opstack/optimism/op-e2e/e2eutils/contracts/foundry.toml
  - infra/opstack/optimism/op-service/gnosis/contracts/foundry.toml
  - infra/opstack/optimism/packages/contracts-bedrock/foundry.toml
  - infra/opstack/optimism/packages/contracts-bedrock/lib/forge-std/foundry.toml
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/foundry.toml
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/lib/forge-std/foundry.toml
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/lib/solady/foundry.toml
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/foundry.toml
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/lib/forge-std/foundry.toml
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solady-v0.0.245/foundry.toml
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solady/foundry.toml
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solmate/foundry.toml
- go
  - core-service/go.mod
  - core-service/go.sum
  - infra/opstack/op-geth/cmd/keeper/go.mod
  - infra/opstack/op-geth/cmd/keeper/go.sum
  - infra/opstack/op-geth/go.mod
  - infra/opstack/op-geth/go.sum
  - infra/opstack/optimism-upstream/cannon/testdata/example/alloc/go.mod
  - infra/opstack/optimism-upstream/cannon/testdata/example/alloc/go.sum
  - infra/opstack/optimism-upstream/cannon/testdata/example/claim/go.mod
  - infra/opstack/optimism-upstream/cannon/testdata/example/claim/go.sum
  - infra/opstack/optimism-upstream/cannon/testdata/example/entry/go.mod
  - infra/opstack/optimism-upstream/cannon/testdata/example/hello/go.mod
  - infra/opstack/optimism-upstream/cannon/testdata/example/multithreaded/go.mod
  - infra/opstack/optimism-upstream/go.mod
  - infra/opstack/optimism-upstream/go.sum
  - infra/opstack/optimism-upstream/third_party/archiver/go.mod
  - infra/opstack/optimism-upstream/third_party/archiver/go.sum
  - infra/opstack/optimism/cannon/testdata/common/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/alloc/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/alloc/go.sum
  - infra/opstack/optimism/cannon/testdata/go-1-23/claim/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/claim/go.sum
  - infra/opstack/optimism/cannon/testdata/go-1-23/entry/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/hello/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-atomic/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-cond/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-general/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-map/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-mutex/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-once/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-oncefunc/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-pool/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-rwmutex/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-value/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/mt-wg/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/syscall-eventfd/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/utilscheck/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/utilscheck2/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/utilscheck3/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-23/utilscheck4/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/alloc/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/alloc/go.sum
  - infra/opstack/optimism/cannon/testdata/go-1-24/claim/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/claim/go.sum
  - infra/opstack/optimism/cannon/testdata/go-1-24/entry/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/hello/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-atomic/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-cond/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-general/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-map/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-mutex/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-once/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-oncefunc/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-pool/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-rwmutex/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-value/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/mt-wg/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/random/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/syscall-eventfd/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/utilscheck/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/utilscheck2/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/utilscheck3/go.mod
  - infra/opstack/optimism/cannon/testdata/go-1-24/utilscheck4/go.mod
  - infra/opstack/optimism/cannon/testdata/utils/go.mod
  - infra/opstack/optimism/go.mod
  - infra/opstack/optimism/go.sum
  - infra/opstack/optimism/packages/contracts-bedrock/lib/superchain-registry/ops/go.mod
  - infra/opstack/optimism/packages/contracts-bedrock/lib/superchain-registry/ops/go.sum
  - infra/opstack/optimism/packages/contracts-bedrock/lib/superchain-registry/validation/go.mod
  - infra/opstack/optimism/packages/contracts-bedrock/lib/superchain-registry/validation/go.sum
  - infra/opstack/optimism/third_party/archiver/go.mod
  - infra/opstack/optimism/third_party/archiver/go.sum
- hardhat
  - contracts/hardhat.config.ts
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/hardhat.config.ts
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/hardhat.config.js
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-upgradeable/hardhat.config.js
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/hardhat.config.js
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts/hardhat.config.js
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/safe-contracts/hardhat.config.ts
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-upgradeable/hardhat.config.js
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/hardhat.config.js
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts/hardhat.config.js
  - infra/opstack/optimism/packages/contracts-bedrock/lib/safe-contracts/hardhat.config.ts
- make
  - core-service/Makefile
  - infra/docker/_backup/20260121-1909/core-service/Makefile
  - infra/docker/_backup/20260121-1909/infra/opstack/op-geth/Makefile
  - infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/Makefile
  - infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/cannon/Makefile
  - infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/op-program/Makefile
  - infra/opstack/op-geth/Makefile
  - infra/opstack/op-geth/tests/evm-benchmarks/Makefile
  - infra/opstack/op-geth/tests/testdata/docs/Makefile
  - infra/opstack/optimism-upstream/Makefile
  - infra/opstack/optimism-upstream/cannon/Makefile
  - infra/opstack/optimism-upstream/cannon/testdata/example/Makefile
  - infra/opstack/optimism-upstream/op-alt-da/Makefile
  - infra/opstack/optimism-upstream/op-batcher/Makefile
  - infra/opstack/optimism-upstream/op-bootnode/Makefile
  - infra/opstack/optimism-upstream/op-chain-ops/Makefile
  - infra/opstack/optimism-upstream/op-challenger/Makefile
  - infra/opstack/optimism-upstream/op-conductor/Makefile
  - infra/opstack/optimism-upstream/op-dispute-mon/Makefile
  - infra/opstack/optimism-upstream/op-e2e/Makefile
  - infra/opstack/optimism-upstream/op-node/Makefile
  - infra/opstack/optimism-upstream/op-program/Makefile
  - infra/opstack/optimism-upstream/op-proposer/Makefile
  - infra/opstack/optimism-upstream/op-service/Makefile
  - infra/opstack/optimism-upstream/op-supervisor/Makefile
  - infra/opstack/optimism-upstream/op-wheel/Makefile
  - infra/opstack/optimism-upstream/ops-bedrock/beacon-data/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/forge-std/lib/ds-test/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/certora/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/lib/forge-std/lib/ds-test/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/lib/solady/lib/ds-test/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-upgradeable/certora/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/certora/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/lib/forge-std/lib/ds-test/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts/certora/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solady/lib/ds-test/Makefile
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solmate/lib/ds-test/Makefile
  - infra/opstack/optimism/Makefile
  - infra/opstack/optimism/cannon/Makefile
  - infra/opstack/optimism/cannon/testdata/Makefile
  - infra/opstack/optimism/cannon/testdata/go-1-23/Makefile
  - infra/opstack/optimism/cannon/testdata/go-1-24/Makefile
  - infra/opstack/optimism/op-alt-da/Makefile
  - infra/opstack/optimism/op-batcher/Makefile
  - infra/opstack/optimism/op-chain-ops/Makefile
  - infra/opstack/optimism/op-challenger/Makefile
  - infra/opstack/optimism/op-conductor/Makefile
  - infra/opstack/optimism/op-dispute-mon/Makefile
  - infra/opstack/optimism/op-dripper/Makefile
  - infra/opstack/optimism/op-e2e/Makefile
  - infra/opstack/optimism/op-interop-mon/Makefile
  - infra/opstack/optimism/op-node/Makefile
  - infra/opstack/optimism/op-program/Makefile
  - infra/opstack/optimism/op-proposer/Makefile
  - infra/opstack/optimism/op-service/Makefile
  - infra/opstack/optimism/op-supernode/Makefile
  - infra/opstack/optimism/op-supervisor/Makefile
  - infra/opstack/optimism/op-test-sequencer/Makefile
  - infra/opstack/optimism/op-wheel/Makefile
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/lib/forge-std/lib/ds-test/Makefile
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/lib/solady/lib/ds-test/Makefile
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-upgradeable/certora/Makefile
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/certora/Makefile
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/lib/forge-std/lib/ds-test/Makefile
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts/certora/Makefile
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solady/lib/ds-test/Makefile
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solmate/lib/ds-test/Makefile
- node
  - apps/api/package.json
  - apps/web/.next-codex/package.json
  - apps/web/.next-codex/types/package.json
  - apps/web/.next-ghost/package.json
  - apps/web/.next-ghost/types/package.json
  - apps/web/.next-local-1769522334/package.json
  - apps/web/.next-local-1769522334/types/package.json
  - apps/web/.next-local-1769522392/package.json
  - apps/web/.next-local-1769522392/types/package.json
  - apps/web/.next-local-1769522572/package.json
  - apps/web/.next-local-1769522572/types/package.json
  - apps/web/.next-local-1769522736/package.json
  - apps/web/.next-local-1769522736/types/package.json
  - apps/web/.next-local-1769522890/package.json
  - apps/web/.next-local-1769522890/types/package.json
  - apps/web/.next-local-1769523056/package.json
  - apps/web/.next-local-1769523056/types/package.json
  - apps/web/.next-local-1769525690/package.json
  - apps/web/.next-local-1769525690/types/package.json
  - apps/web/.next/types/package.json
  - apps/web/package.json
  - apps/worker/package.json
  - contracts/lib/forge-std/package.json
  - contracts/package-lock.json
  - contracts/package.json
  - infra/opstack/gate/package-lock.json
  - infra/opstack/gate/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/forge-std/lib/ds-test/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/forge-std/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/contracts/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/lib/forge-std/lib/ds-test/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/lib/forge-std/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/package-lock.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/scripts/solhint-custom/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/prb-test/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/prb-test/pnpm-lock.yaml
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/yarn.lock
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/forge-std/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/lib/forge-std/lib/ds-test/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/lib/forge-std/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/lib/solady/package-lock.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/lib/solady/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-upgradeable/contracts/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-upgradeable/package-lock.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-upgradeable/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/contracts/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/lib/forge-std/lib/ds-test/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/lib/forge-std/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/package-lock.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/scripts/solhint-custom/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts/contracts/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts/package-lock.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/safe-contracts/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/safe-contracts/yarn.lock
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solady-v0.0.245/package-lock.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solady-v0.0.245/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solady/package-lock.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solady/package.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solmate/package-lock.json
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/solmate/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/forge-std/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/lib/forge-std/lib/ds-test/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/lib/forge-std/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/lib/solady/package-lock.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/lib/solady/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-upgradeable/contracts/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-upgradeable/package-lock.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-upgradeable/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/contracts/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/lib/forge-std/lib/ds-test/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/lib/forge-std/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/package-lock.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/scripts/solhint-custom/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts/contracts/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts/package-lock.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/safe-contracts/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/safe-contracts/yarn.lock
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solady-v0.0.245/package-lock.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solady-v0.0.245/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solady/package-lock.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solady/package.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solmate/package-lock.json
  - infra/opstack/optimism/packages/contracts-bedrock/lib/solmate/package.json
  - package-lock.json
  - package.json
  - packages/config/package.json
  - packages/contract-schemas/package.json
  - packages/ghostchain-sdk/package.json
  - packages/ghostwallet/package.json
  - packages/sdk/package.json
  - packages/types/package.json
  - packages/ui/package.json
  - services/agent-node/package.json
  - services/agent-registry-service/package.json
  - services/ai-clock-sync/package-lock.json
  - services/ai-clock-sync/package.json
  - services/ai-monitor/package-lock.json
  - services/ai-monitor/package.json
  - services/ai-vault/package.json
  - services/alerts-service/package.json
  - services/anomaly-detection-service/package.json
  - services/audit-log-service/package.json
  - services/auth-service/package.json
  - services/block-index-service/package.json
  - services/bridge-service/package-lock.json
  - services/bridge-service/package.json
  - services/chain-status-service/package.json
  - services/command-palette-service/package.json
  - services/compliance-export-service/package.json
  - services/consensus-telemetry-service/package-lock.json
  - services/consensus-telemetry-service/package.json
  - services/contract-registry-service/package.json
  - services/contract-risk-service/package.json
  - services/dispute-service/package.json
  - services/entity-tagging-service/package.json
  - services/explainability-service/package.json
  - services/feature-flags-service/package.json
  - services/fee-model-service/package.json
  - services/forecasting-service/package.json
  - services/ghost-ai-attestor/package-lock.json
  - services/ghost-ai-attestor/package.json
  - services/ghost-compliance-worker/package.json
  - services/ghost-compliance/package-lock.json
  - services/ghost-compliance/package.json
  - services/ghost-gas-engine/package-lock.json
  - services/ghost-gas-engine/package.json
  - services/ghost-guard/package.json
  - services/ghost-pil/package-lock.json
  - services/ghost-pil/package.json
  - services/ghost-registry/package-lock.json
  - services/ghost-registry/package.json
  - services/ghost-relayer/package-lock.json
  - services/ghost-relayer/package.json
  - services/ghost-rollup-challenger/package-lock.json
  - services/ghost-rollup-challenger/package.json
  - services/ghost-rollup-proposer/package-lock.json
  - services/ghost-rollup-proposer/package.json
  - services/global-search-service/package.json
  - services/governance-service/package.json
  - services/key-rotation-service/package.json
  - services/liquidity-service/package.json
  - services/mempool-service/package.json
  - services/network-context-service/package-lock.json
  - services/network-context-service/package.json
  - services/network-manager-service/package.json
  - services/node-health-service/package.json
  - services/node-inventory-service/package.json
  - services/notifications-service/package.json
  - services/participation-service/package.json
  - services/payout-service/package.json
  - services/peer-graph-service/package.json
  - services/proxy-inspector-service/package.json
  - services/rbac-service/package.json
  - services/rewards-service/package.json
  - services/secrets-health-service/package.json
  - services/session-service/package.json
  - services/slashing-detection-service/package.json
  - services/snapshot-service/package.json
  - services/staking-service/package.json
  - services/supply-service/package.json
  - services/theme-service/package.json
  - services/transfer-lifecycle-service/package.json
  - services/treasury-ai/package.json
  - services/treasury-evidence/package.json
  - services/treasury-service/package.json
  - services/tx-index-service/package.json
  - services/upgrade-orchestrator-service/package.json
  - services/validator-service/package.json
  - services/verification-service/package.json
- python
  - infra/opstack/op-geth/cmd/clef/requirements.txt
  - infra/opstack/op-geth/tests/evm-benchmarks/requirements.txt
  - infra/opstack/op-geth/tests/testdata/LegacyTests/src/LegacyTests/Cancun/GeneralStateTestsFiller/Pyspecs/cancun/eip4844_blobs/point_evaluation_vectors/requirements.txt
  - infra/opstack/op-geth/tests/testdata/requirements.txt
  - infra/opstack/optimism-upstream/ops/check-changed/requirements.txt
  - infra/opstack/optimism-upstream/ops/tag-service/requirements.txt
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/automate/lib/openzeppelin-contracts/requirements.txt
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/requirements.txt
  - infra/opstack/optimism/ops/check-changed/requirements.txt
  - infra/opstack/optimism/packages/contracts-bedrock/lib/openzeppelin-contracts-v5/requirements.txt
- rust
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/Cargo.lock
  - infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/lib-keccak/Cargo.toml
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/Cargo.lock
  - infra/opstack/optimism/packages/contracts-bedrock/lib/lib-keccak/Cargo.toml

## Compose files
- apps/docker-compose.dev.yml: 4 services
- apps/docker-compose.yml: 5 services
- core-service/docker-compose.yml: 1 services
- docker-compose.agents.yml: 10 services
- docker-compose.dev.yml: 2 services
- docker-compose.yml: 5 services
- infra/docker/_backup/20260121-1909/core-service/docker-compose.yml: 1 services
- infra/docker/_backup/20260121-1909/docker-compose.dev.yml: 2 services
- infra/docker/_backup/20260121-1909/docker-compose.yml: 6 services
- infra/docker/_backup/20260121-1909/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/docker/_backup/20260121-1909/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.challengers.yml: 2 services
- infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.l3.yml: 50 services
- infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.mainnet-geth.yml: 1 services
- infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.network-manager.yml: 1 services
- infra/docker/_backup/20260121-1909/infra/opstack/docker-compose.yml: 12 services
- infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/interop-devnet/docker-compose.yml: 16 services
- infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/ops-bedrock/docker-compose.yml: 11 services
- infra/docker/_backup/20260121-1909/observability/infra/docker-compose.yml: 5 services
- infra/docker/_backup/20260121-1909/services/docker-compose.yml: 55 services
- infra/docker/compose/docker-compose.ai.yml: 6 services
- infra/docker/compose/docker-compose.core.yml: 91 services
- infra/docker/compose/docker-compose.obs.yml: 5 services
- infra/docker/compose/docker-compose.services.yml: 62 services
- infra/docker/compose/docker-compose.ui.yml: 2 services
- infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/docker-compose.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.challengers.yml: 2 services
- infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.l3.yml: 50 services
- infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.challengers.yml: 2 services
- infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.l3.yml: 50 services
- infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.challengers.yml: 2 services
- infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.l3.yml: 50 services
- infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.challengers.yml: 2 services
- infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.l3.yml: 49 services
- infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.challengers.yml: 2 services
- infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.l3.yml: 49 services
- infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.challengers.yml: 2 services
- infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.l3.yml: 49 services
- infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.challengers.yml: 2 services
- infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.l3.yml: 49 services
- infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l3-20260203T190609Z/snapshots/infra/opstack/docker-compose.l3.yml: 49 services
- infra/evidence/out/evidence-pack-l3-20260203T190609Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l3-20260203T191530Z/snapshots/infra/opstack/docker-compose.l3.yml: 49 services
- infra/evidence/out/evidence-pack-l3-20260203T191530Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l3-20260203T191630Z/snapshots/infra/opstack/docker-compose.l3.yml: 49 services
- infra/evidence/out/evidence-pack-l3-20260203T191630Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l3-20260203T191811Z/snapshots/infra/opstack/docker-compose.l3.yml: 49 services
- infra/evidence/out/evidence-pack-l3-20260203T191811Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/evidence/out/evidence-pack-l3-20260203T192351Z/snapshots/infra/opstack/docker-compose.l3.yml: 49 services
- infra/evidence/out/evidence-pack-l3-20260203T192351Z/snapshots/infra/opstack/docker-compose.yml: 20 services
- infra/ghostchain/docker-compose.l1.yml: 5 services
- infra/ghostchain/docker-compose.ibft.yml: 4 services
- infra/opstack/docker-compose.challengers.yml: 2 services
- infra/opstack/docker-compose.l3.yml: 49 services
- infra/opstack/docker-compose.mainnet-geth.yml: 1 services
- infra/opstack/docker-compose.network-manager.yml: 1 services
- infra/opstack/docker-compose.yml: 20 services
- infra/opstack/optimism-upstream/interop-devnet/docker-compose.yml: 16 services
- infra/opstack/optimism-upstream/ops-bedrock/docker-compose.yml: 11 services
- observability/infra/docker-compose.yml: 4 services
- services/ai-clock-sync/docker-compose.yml: 1 services
- services/ai-clock-sync/rollback/20260125-132116/docker-compose.yml: 1 services
- services/ai-clock-sync/rollback/20260125-132244/docker-compose.yml: 1 services
- services/ai-clock-sync/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ai-monitor/docker-compose.yml: 3 services
- services/ai-monitor/rollback/20260125-132116/docker-compose.yml: 1 services
- services/ai-monitor/rollback/20260125-132244/docker-compose.yml: 1 services
- services/ai-monitor/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ai-vault/docker-compose.yml: 1 services
- services/alerts-service/docker-compose.yml: 1 services
- services/alerts-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/alerts-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/alerts-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/anomaly-detection-service/docker-compose.yml: 1 services
- services/anomaly-detection-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/anomaly-detection-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/anomaly-detection-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/audit-log-service/docker-compose.yml: 1 services
- services/audit-log-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/audit-log-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/audit-log-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/auth-service/docker-compose.yml: 1 services
- services/auth-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/auth-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/auth-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/block-index-service/docker-compose.yml: 1 services
- services/block-index-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/block-index-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/block-index-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/bridge-service/docker-compose.yml: 1 services
- services/bridge-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/bridge-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/bridge-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/chain-status-service/docker-compose.yml: 1 services
- services/chain-status-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/chain-status-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/chain-status-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/command-palette-service/docker-compose.yml: 1 services
- services/command-palette-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/command-palette-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/command-palette-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/compliance-export-service/docker-compose.yml: 1 services
- services/compliance-export-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/compliance-export-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/compliance-export-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/consensus-telemetry-service/docker-compose.yml: 1 services
- services/consensus-telemetry-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/consensus-telemetry-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/consensus-telemetry-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/contract-registry-service/docker-compose.yml: 1 services
- services/contract-registry-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/contract-registry-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/contract-registry-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/contract-risk-service/docker-compose.yml: 1 services
- services/contract-risk-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/contract-risk-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/contract-risk-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/dispute-service/docker-compose.yml: 1 services
- services/dispute-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/dispute-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/dispute-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/docker-compose.legacy.yml: 66 services
- services/entity-tagging-service/docker-compose.yml: 1 services
- services/entity-tagging-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/entity-tagging-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/entity-tagging-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/explainability-service/docker-compose.yml: 1 services
- services/explainability-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/explainability-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/explainability-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/feature-flags-service/docker-compose.yml: 1 services
- services/feature-flags-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/feature-flags-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/feature-flags-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/fee-model-service/docker-compose.yml: 1 services
- services/fee-model-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/fee-model-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/fee-model-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/forecasting-service/docker-compose.yml: 1 services
- services/forecasting-service/rollback/20260125-132116/docker-compose.yml: 1 services
- services/forecasting-service/rollback/20260125-132244/docker-compose.yml: 1 services
- services/forecasting-service/rollback/20260125-132411/docker-compose.yml: 1 services
- services/gas-engine-migrate/docker-compose.yml: 1 services
- services/gas-engine-migrate/rollback/20260125-132116/docker-compose.yml: 1 services
- services/gas-engine-migrate/rollback/20260125-132244/docker-compose.yml: 1 services
- services/gas-engine-migrate/rollback/20260125-132411/docker-compose.yml: 1 services
- services/gas-engine-postgres/docker-compose.yml: 1 services
- services/gas-engine-postgres/rollback/20260125-132116/docker-compose.yml: 1 services
- services/gas-engine-postgres/rollback/20260125-132244/docker-compose.yml: 1 services
- services/gas-engine-postgres/rollback/20260125-132411/docker-compose.yml: 1 services
- services/gas-engine-redis/docker-compose.yml: 1 services
- services/gas-engine-redis/rollback/20260125-132116/docker-compose.yml: 1 services
- services/gas-engine-redis/rollback/20260125-132244/docker-compose.yml: 1 services
- services/gas-engine-redis/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-ai-attestor/docker-compose.yml: 1 services
- services/ghost-compliance-worker/docker-compose.yml: 1 services
- services/ghost-compliance-worker/rollback/20260125-132116/docker-compose.yml: 1 services
- services/ghost-compliance-worker/rollback/20260125-132244/docker-compose.yml: 1 services
- services/ghost-compliance-worker/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-compliance/docker-compose.yml: 1 services
- services/ghost-compliance/rollback/20260125-132116/docker-compose.yml: 1 services
- services/ghost-compliance/rollback/20260125-132244/docker-compose.yml: 1 services
- services/ghost-compliance/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-gas-engine-worker/docker-compose.yml: 1 services
- services/ghost-gas-engine-worker/rollback/20260125-132244/docker-compose.yml: 1 services
- services/ghost-gas-engine-worker/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-gas-engine/docker-compose.yml: 1 services
- services/ghost-gas-engine/rollback/20260125-132116/docker-compose.yml: 1 services
- services/ghost-gas-engine/rollback/20260125-132244/docker-compose.yml: 1 services
- services/ghost-gas-engine/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-pil-worker/docker-compose.yml: 1 services
- services/ghost-pil-worker/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-pil/docker-compose.yml: 1 services
- services/ghost-pil/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-registry/docker-compose.yml: 1 services
- services/ghost-registry/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-relayer/docker-compose.yml: 1 services
- services/ghost-relayer/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-rollup-challenger/docker-compose.yml: 1 services
- services/ghost-rollup-challenger/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-rollup-proposer/docker-compose.yml: 1 services
- services/ghost-rollup-proposer/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghost-rpc-proxy/docker-compose.yml: 1 services
- services/ghost-rpc-proxy/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghostscout-db/docker-compose.yml: 1 services
- services/ghostscout-db/rollback/20260125-132411/docker-compose.yml: 1 services
- services/ghostscout-frontend-l1/docker-compose.yml: 1 services
- services/ghostscout-frontend-l2/docker-compose.yml: 1 services
- services/ghostscout-frontend-l3/docker-compose.yml: 1 services
- services/ghostscout-l1/docker-compose.yml: 1 services
- services/ghostscout-l2/docker-compose.yml: 1 services
- services/ghostscout-l3/docker-compose.yml: 1 services
- services/global-search-service/docker-compose.yml: 1 services
- services/governance-service/docker-compose.yml: 1 services
- services/key-rotation-service/docker-compose.yml: 1 services
- services/liquidity-service/docker-compose.yml: 1 services
- services/mempool-service/docker-compose.yml: 1 services
- services/network-context-service/docker-compose.yml: 1 services
- services/network-manager-service/docker-compose.yml: 1 services
- services/node-health-service/docker-compose.yml: 1 services
- services/node-inventory-service/docker-compose.yml: 1 services
- services/notifications-service/docker-compose.yml: 1 services
- services/participation-service/docker-compose.yml: 1 services
- services/payout-service/docker-compose.yml: 1 services
- services/peer-graph-service/docker-compose.yml: 1 services
- services/pil-migrate/docker-compose.yml: 1 services
- services/pil-postgres/docker-compose.yml: 1 services
- services/proxy-inspector-service/docker-compose.yml: 1 services
- services/rbac-service/docker-compose.yml: 1 services
- services/rewards-service/docker-compose.yml: 1 services
- services/rpc-forward-l1-29545/docker-compose.yml: 1 services
- services/secrets-health-service/docker-compose.yml: 1 services
- services/session-service/docker-compose.yml: 1 services
- services/slashing-detection-service/docker-compose.yml: 1 services
- services/snapshot-service/docker-compose.yml: 1 services
- services/staking-service/docker-compose.yml: 1 services
- services/supply-service/docker-compose.yml: 1 services
- services/theme-service/docker-compose.yml: 1 services
- services/transfer-lifecycle-service/docker-compose.yml: 1 services
- services/treasury-service/docker-compose.yml: 1 services
- services/tx-index-service/docker-compose.yml: 1 services
- services/upgrade-orchestrator-service/docker-compose.yml: 1 services
- services/validator-service/docker-compose.yml: 1 services
- services/verification-service/docker-compose.yml: 1 services

### Compose parse errors
- services/ai-clock-sync/rollback/20260125-131922/docker-compose.yml: invalid yaml structure

## Env files
- .env
- .env.example
- apps/api/.env.docker
- apps/api/.env.example
- apps/api/.env.local
- apps/api/.env.local.example
- apps/web/.env.docker
- apps/web/.env.example
- apps/web/.env.local
- apps/web/.env.local.example
- infra/docker/_backup/20260121-1909/.env
- infra/docker/_backup/20260121-1909/.env.example
- infra/docker/_backup/20260121-1909/apps/api/.env.example
- infra/docker/_backup/20260121-1909/apps/api/.env.local
- infra/docker/_backup/20260121-1909/apps/api/.env.local.example
- infra/docker/_backup/20260121-1909/apps/web/.env.example
- infra/docker/_backup/20260121-1909/apps/web/.env.local
- infra/docker/_backup/20260121-1909/apps/web/.env.local.example
- infra/docker/_backup/20260121-1909/infra/opstack/.env
- infra/docker/_backup/20260121-1909/infra/opstack/.env.example
- infra/docker/_backup/20260121-1909/infra/opstack/.env.l3
- infra/docker/_backup/20260121-1909/infra/opstack/.env.l3.example
- infra/docker/_backup/20260121-1909/infra/opstack/.env.mainnet.example
- infra/docker/_backup/20260121-1909/infra/opstack/.env.sample
- infra/docker/_backup/20260121-1909/infra/opstack/.env.secrets
- infra/docker/_backup/20260121-1909/infra/opstack/.env.secrets.sample
- infra/docker/_backup/20260121-1909/infra/opstack/.env.sepolia.example
- infra/docker/_backup/20260121-1909/infra/opstack/l3/ghostl3/.env
- infra/docker/_backup/20260121-1909/infra/opstack/l3/ghostsample/.env
- infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/.envrc.example
- infra/docker/_backup/20260121-1909/infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/safe-contracts/.env.sample
- infra/docker/_backup/20260121-1909/services/.env
- infra/docker/_backup/20260121-1909/services/ai-monitor/.env.example
- infra/docker/_backup/20260121-1909/services/ghost-compliance-worker/.env.example
- infra/docker/_backup/20260121-1909/services/ghost-compliance/.env.example
- infra/docker/_backup/20260121-1909/services/ghost-relayer/.env
- infra/docker/_backup/20260121-1909/services/ghost-relayer/.env.example
- infra/docker/_backup/20260121-1909/services/ghost-rollup-challenger/.env.example
- infra/docker/_backup/20260121-1909/services/ghost-rollup-challenger/.env.l2
- infra/docker/_backup/20260121-1909/services/ghost-rollup-challenger/.env.l3
- infra/docker/_backup/20260121-1909/services/ghost-rollup-proposer/.env.example
- infra/docker/_backup/20260121-1909/services/ghost-rollup-proposer/.env.l2
- infra/docker/_backup/20260121-1909/services/ghost-rollup-proposer/.env.l3
- infra/docker/_backup/20260121-1909/services/ghost-rollup-proposer/.env.prod.l2.example
- infra/docker/_backup/20260121-1909/services/ghost-rollup-proposer/.env.prod.l3.example
- infra/evidence/out/evidence-pack-l1-20260202T132538Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T133818Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T134135Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T134249Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T141647Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T141757Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T142035Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T142718Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T151403Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T152510Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T154229Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260202T154243Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260203T123104Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260203T123126Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260203T124507Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l1-20260203T124932Z/snapshots/.env.example
- infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/.env.l2.example
- infra/evidence/out/evidence-pack-l2-20260202T174405Z/snapshots/infra/opstack/.env.sample
- infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/.env.l2.example
- infra/evidence/out/evidence-pack-l2-20260202T174830Z/snapshots/infra/opstack/.env.sample
- infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/.env.l2.example
- infra/evidence/out/evidence-pack-l2-20260202T175423Z/snapshots/infra/opstack/.env.sample
- infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/.env.l2.example
- infra/evidence/out/evidence-pack-l2-20260203T190449Z/snapshots/infra/opstack/.env.sample
- infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/.env.l2.example
- infra/evidence/out/evidence-pack-l2-20260203T191413Z/snapshots/infra/opstack/.env.sample
- infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/.env.l2.example
- infra/evidence/out/evidence-pack-l2-20260203T191748Z/snapshots/infra/opstack/.env.sample
- infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/.env.l2.example
- infra/evidence/out/evidence-pack-l2-20260203T192332Z/snapshots/infra/opstack/.env.sample
- infra/evidence/out/evidence-pack-l3-20260203T190609Z/snapshots/infra/opstack/.env.l3.example
- infra/evidence/out/evidence-pack-l3-20260203T191530Z/snapshots/infra/opstack/.env.l3.example
- infra/evidence/out/evidence-pack-l3-20260203T191630Z/snapshots/infra/opstack/.env.l3.example
- infra/evidence/out/evidence-pack-l3-20260203T191811Z/snapshots/infra/opstack/.env.l3.example
- infra/evidence/out/evidence-pack-l3-20260203T192351Z/snapshots/infra/opstack/.env.l3.example
- infra/ghostchain/.env
- infra/ghostchain/.env.l1
- infra/ghostchain/.env.l1.example
- infra/opstack/.env
- infra/opstack/.env.example
- infra/opstack/.env.l2
- infra/opstack/.env.l2.example
- infra/opstack/.env.l3
- infra/opstack/.env.l3.example
- infra/opstack/.env.l3.generated
- infra/opstack/.env.mainnet.example
- infra/opstack/.env.sample
- infra/opstack/.env.secrets
- infra/opstack/.env.secrets.sample
- infra/opstack/.env.sepolia.example
- infra/opstack/l3/ghostl3/.env
- infra/opstack/l3/ghostsample/.env
- infra/opstack/optimism-upstream/.envrc.example
- infra/opstack/optimism-upstream/packages/contracts-bedrock/lib/safe-contracts/.env.sample
- infra/opstack/optimism/packages/contracts-bedrock/lib/safe-contracts/.env.sample
- services/.env
- services/ai-clock-sync/.env
- services/ai-clock-sync/rollback/20260125-131922/.env
- services/ai-clock-sync/rollback/20260125-132116/.env
- services/ai-clock-sync/rollback/20260125-132244/.env
- services/ai-clock-sync/rollback/20260125-132411/.env
- services/ai-monitor/.env
- services/ai-monitor/.env.example
- services/ai-monitor/rollback/20260125-132116/.env
- services/ai-monitor/rollback/20260125-132244/.env
- services/ai-monitor/rollback/20260125-132411/.env
- services/ai-vault/.env.example
- services/alerts-service/.env
- services/alerts-service/rollback/20260125-132116/.env
- services/alerts-service/rollback/20260125-132244/.env
- services/alerts-service/rollback/20260125-132411/.env
- services/anomaly-detection-service/.env
- services/anomaly-detection-service/rollback/20260125-132116/.env
- services/anomaly-detection-service/rollback/20260125-132244/.env
- services/anomaly-detection-service/rollback/20260125-132411/.env
- services/audit-log-service/.env
- services/audit-log-service/rollback/20260125-132116/.env
- services/audit-log-service/rollback/20260125-132244/.env
- services/audit-log-service/rollback/20260125-132411/.env
- services/auth-service/.env
- services/auth-service/rollback/20260125-132116/.env
- services/auth-service/rollback/20260125-132244/.env
- services/auth-service/rollback/20260125-132411/.env
- services/block-index-service/.env
- services/block-index-service/rollback/20260125-132116/.env
- services/block-index-service/rollback/20260125-132244/.env
- services/block-index-service/rollback/20260125-132411/.env
- services/bridge-service/.env
- services/bridge-service/rollback/20260125-132116/.env
- services/bridge-service/rollback/20260125-132244/.env
- services/bridge-service/rollback/20260125-132411/.env
- services/chain-status-service/.env
- services/chain-status-service/rollback/20260125-132116/.env
- services/chain-status-service/rollback/20260125-132244/.env
- services/chain-status-service/rollback/20260125-132411/.env
- services/command-palette-service/.env
- services/command-palette-service/rollback/20260125-132116/.env
- services/command-palette-service/rollback/20260125-132244/.env
- services/command-palette-service/rollback/20260125-132411/.env
- services/compliance-export-service/.env
- services/compliance-export-service/rollback/20260125-132116/.env
- services/compliance-export-service/rollback/20260125-132244/.env
- services/compliance-export-service/rollback/20260125-132411/.env
- services/consensus-telemetry-service/.env
- services/consensus-telemetry-service/rollback/20260125-132116/.env
- services/consensus-telemetry-service/rollback/20260125-132244/.env
- services/consensus-telemetry-service/rollback/20260125-132411/.env
- services/contract-registry-service/.env
- services/contract-registry-service/rollback/20260125-132116/.env
- services/contract-registry-service/rollback/20260125-132244/.env
- services/contract-registry-service/rollback/20260125-132411/.env
- services/contract-risk-service/.env
- services/contract-risk-service/rollback/20260125-132116/.env
- services/contract-risk-service/rollback/20260125-132244/.env
- services/contract-risk-service/rollback/20260125-132411/.env
- services/dispute-service/.env
- services/dispute-service/rollback/20260125-132116/.env
- services/dispute-service/rollback/20260125-132244/.env
- services/dispute-service/rollback/20260125-132411/.env
- services/entity-tagging-service/.env
- services/entity-tagging-service/rollback/20260125-132116/.env
- services/entity-tagging-service/rollback/20260125-132244/.env
- services/entity-tagging-service/rollback/20260125-132411/.env
- services/explainability-service/.env
- services/explainability-service/rollback/20260125-132116/.env
- services/explainability-service/rollback/20260125-132244/.env
- services/explainability-service/rollback/20260125-132411/.env
- services/feature-flags-service/.env
- services/feature-flags-service/rollback/20260125-132116/.env
- services/feature-flags-service/rollback/20260125-132244/.env
- services/feature-flags-service/rollback/20260125-132411/.env
- services/fee-model-service/.env
- services/fee-model-service/rollback/20260125-132116/.env
- services/fee-model-service/rollback/20260125-132244/.env
- services/fee-model-service/rollback/20260125-132411/.env
- services/forecasting-service/.env
- services/forecasting-service/rollback/20260125-132116/.env
- services/forecasting-service/rollback/20260125-132244/.env
- services/forecasting-service/rollback/20260125-132411/.env
- services/gas-engine-migrate/.env
- services/gas-engine-migrate/rollback/20260125-132116/.env
- services/gas-engine-migrate/rollback/20260125-132244/.env
- services/gas-engine-migrate/rollback/20260125-132411/.env
- services/gas-engine-postgres/.env
- services/gas-engine-postgres/rollback/20260125-132116/.env
- services/gas-engine-postgres/rollback/20260125-132244/.env
- services/gas-engine-postgres/rollback/20260125-132411/.env
- services/gas-engine-redis/.env
- services/gas-engine-redis/rollback/20260125-132116/.env
- services/gas-engine-redis/rollback/20260125-132244/.env
- services/gas-engine-redis/rollback/20260125-132411/.env
- services/ghost-compliance-worker/.env
- services/ghost-compliance-worker/.env.example
- services/ghost-compliance-worker/rollback/20260125-132116/.env
- services/ghost-compliance-worker/rollback/20260125-132244/.env
- services/ghost-compliance-worker/rollback/20260125-132411/.env
- services/ghost-compliance/.env
- services/ghost-compliance/.env.example
- services/ghost-compliance/rollback/20260125-132116/.env
- services/ghost-compliance/rollback/20260125-132244/.env
- services/ghost-compliance/rollback/20260125-132411/.env
- services/ghost-gas-engine-worker/.env
- services/ghost-gas-engine-worker/rollback/20260125-132244/.env
- services/ghost-gas-engine-worker/rollback/20260125-132411/.env
- services/ghost-gas-engine/.env
- services/ghost-gas-engine/.env.example
- services/ghost-gas-engine/rollback/20260125-132116/.env
- services/ghost-gas-engine/rollback/20260125-132244/.env
- services/ghost-gas-engine/rollback/20260125-132411/.env
- services/ghost-guard/.env
- services/ghost-pil-worker/.env
- services/ghost-pil-worker/rollback/20260125-132411/.env
- services/ghost-pil/.env
- services/ghost-pil/.env.example
- services/ghost-pil/rollback/20260125-132411/.env
- services/ghost-registry/.env
- services/ghost-registry/rollback/20260125-132411/.env
- services/ghost-relayer/.env
- services/ghost-relayer/.env.example
- services/ghost-relayer/rollback/20260125-132244/.env
- services/ghost-relayer/rollback/20260125-132411/.env
- services/ghost-rollup-challenger/.env
- services/ghost-rollup-challenger/.env.example
- services/ghost-rollup-challenger/.env.l2
- services/ghost-rollup-challenger/.env.l3
- services/ghost-rollup-challenger/rollback/20260125-132411/.env
- services/ghost-rollup-proposer/.env
- services/ghost-rollup-proposer/.env.example
- services/ghost-rollup-proposer/.env.l2
- services/ghost-rollup-proposer/.env.l3
- services/ghost-rollup-proposer/.env.prod.l2.example
- services/ghost-rollup-proposer/.env.prod.l3.example
- services/ghost-rollup-proposer/rollback/20260125-132411/.env
- services/ghost-rpc-proxy/.env
- services/ghost-rpc-proxy/rollback/20260125-132411/.env
- services/ghostscout-db/.env
- services/ghostscout-db/rollback/20260125-132411/.env
- services/ghostscout-frontend-l1/.env
- services/ghostscout-frontend-l2/.env
- services/ghostscout-frontend-l3/.env
- services/ghostscout-l1/.env
- services/ghostscout-l2/.env
- services/ghostscout-l3/.env
- services/global-search-service/.env
- services/governance-service/.env
- services/key-rotation-service/.env
- services/liquidity-service/.env
- services/mempool-service/.env
- services/network-context-service/.env
- services/network-manager-service/.env
- services/node-health-service/.env
- services/node-inventory-service/.env
- services/notifications-service/.env
- services/participation-service/.env
- services/payout-service/.env
- services/peer-graph-service/.env
- services/pil-migrate/.env
- services/pil-postgres/.env
- services/proxy-inspector-service/.env
- services/rbac-service/.env
- services/rewards-service/.env
- services/rpc-forward-l1-29545/.env
- services/secrets-health-service/.env
- services/session-service/.env
- services/slashing-detection-service/.env
- services/snapshot-service/.env
- services/staking-service/.env
- services/supply-service/.env
- services/theme-service/.env
- services/transfer-lifecycle-service/.env
- services/treasury-service/.env
- services/tx-index-service/.env
- services/upgrade-orchestrator-service/.env
- services/validator-service/.env
- services/verification-service/.env

## CI workflows
- .github/workflows/ai-governance-gate.yml
- .github/workflows/ci.yml
- .github/workflows/docker-dry-run.yml
- .github/workflows/docker-publish.yml

## Security tooling/config hints
- .gitleaks.toml
- infra/opstack/optimism-upstream/.semgrepignore
- infra/opstack/optimism/.semgrepignore
- scripts/security/semgrep.yml
- trivy-secret.yaml

## Baseline runtime (read-only)
### docker ps
```
services-block-index-service-1	Up 21 minutes (healthy)	0.0.0.0:7626->7626/tcp, [::]:7626->7626/tcp
services-verification-service-1	Up 22 minutes (healthy)	0.0.0.0:7630->7630/tcp, [::]:7630->7630/tcp
services-proxy-inspector-service-1	Up 5 hours (healthy)	0.0.0.0:7631->7631/tcp, [::]:7631->7631/tcp
services-entity-tagging-service-1	Up 5 hours (healthy)	0.0.0.0:7627->7627/tcp, [::]:7627->7627/tcp
services-auth-service-1	Up 5 hours (healthy)	0.0.0.0:7639->7639/tcp, [::]:7639->7639/tcp
services-treasury-service-1	Up 5 hours (healthy)	0.0.0.0:7628->7628/tcp, [::]:7628->7628/tcp
services-liquidity-service-1	Up 5 hours (healthy)	0.0.0.0:7606->7606/tcp, [::]:7606->7606/tcp
services-participation-service-1	Up 5 hours (healthy)	0.0.0.0:7603->7603/tcp, [::]:7603->7603/tcp
services-supply-service-1	Up 5 hours (healthy)	0.0.0.0:7614->7614/tcp, [::]:7614->7614/tcp
services-staking-service-1	Up 5 hours (healthy)	0.0.0.0:7601->7601/tcp, [::]:7601->7601/tcp
services-forecasting-service-1	Up 5 hours (healthy)	0.0.0.0:7617->7617/tcp, [::]:7617->7617/tcp
services-fee-model-service-1	Up 5 hours (healthy)	0.0.0.0:7615->7615/tcp, [::]:7615->7615/tcp
services-rewards-service-1	Up 5 hours (healthy)	0.0.0.0:7602->7602/tcp, [::]:7602->7602/tcp
services-compliance-export-service-1	Up 5 hours (healthy)	0.0.0.0:7621->7621/tcp, [::]:7621->7621/tcp
ghostchain-agents-evidence-service-1	Up 5 hours	0.0.0.0:17641->7641/tcp, [::]:17641->7641/tcp
services-audit-log-service-1	Up 5 hours (healthy)	
services-upgrade-orchestrator-service-1	Up 5 hours (healthy)	0.0.0.0:7623->7623/tcp, [::]:7623->7623/tcp
services-snapshot-service-1	Up 5 hours (healthy)	0.0.0.0:7624->7624/tcp, [::]:7624->7624/tcp
services-alerts-service-1	Up 5 hours (healthy)	0.0.0.0:7644->7644/tcp, [::]:7644->7644/tcp
services-command-palette-service-1	Up 6 hours (healthy)	0.0.0.0:7642->7642/tcp, [::]:7642->7642/tcp
services-session-service-1	Up 6 hours (healthy)	0.0.0.0:7643->7643/tcp, [::]:7643->7643/tcp
services-peer-graph-service-1	Up 6 hours (healthy)	0.0.0.0:7636->7636/tcp, [::]:7636->7636/tcp
services-consensus-telemetry-service-1	Up 6 hours (healthy)	0.0.0.0:7635->7635/tcp, [::]:7635->7635/tcp
services-network-context-service-1	Up 6 hours (healthy)	0.0.0.0:7633->7633/tcp, [::]:7633->7633/tcp
services-chain-status-service-1	Up 6 hours (healthy)	0.0.0.0:7612->7612/tcp, [::]:7612->7612/tcp
services-rbac-service-1	Up 6 hours (healthy)	0.0.0.0:7640->7640/tcp, [::]:7640->7640/tcp
ghostchain-agents-governance-service-1	Up 6 hours	0.0.0.0:17645->7645/tcp, [::]:17645->7645/tcp
services-governance-service-1	Up 6 hours (healthy)	
services-theme-service-1	Up 6 hours (healthy)	0.0.0.0:7634->7634/tcp, [::]:7634->7634/tcp
services-feature-flags-service-1	Up 6 hours (healthy)	0.0.0.0:7611->7611/tcp, [::]:7611->7611/tcp
services-global-search-service-1	Up 6 hours (healthy)	0.0.0.0:7637->7637/tcp, [::]:7637->7637/tcp
services-notifications-service-1	Up 6 hours (healthy)	0.0.0.0:7638->7638/tcp, [::]:7638->7638/tcp
services-node-inventory-service-1	Up 6 hours (healthy)	0.0.0.0:7622->7622/tcp, [::]:7622->7622/tcp
services-mempool-service-1	Up 6 hours (healthy)	0.0.0.0:7610->7610/tcp, [::]:7610->7610/tcp
services-node-health-service-1	Up 6 hours (healthy)	0.0.0.0:7613->7613/tcp, [::]:7613->7613/tcp
services-validator-service-1	Up 6 hours (healthy)	0.0.0.0:7600->7600/tcp, [::]:7600->7600/tcp
services-contract-registry-service-1	Up 6 hours (healthy)	0.0.0.0:7608->7608/tcp, [::]:7608->7608/tcp
595ffab5f59b_services-ghost-gas-engine-worker-1	Up 6 hours (healthy)	3210/tcp
services-ghost-gas-engine-1	Up 6 hours (healthy)	0.0.0.0:3210->3210/tcp, [::]:3210->3210/tcp
services-bridge-service-1	Up 6 hours (healthy)	0.0.0.0:7604->7604/tcp, [::]:7604->7604/tcp
services-ghost-registry-1	Up 6 hours (healthy)	0.0.0.0:18088->8088/tcp, [::]:18088->8088/tcp
services-ghost-rollup-challenger-1	Up 6 hours (healthy)	0.0.0.0:7282->7282/tcp, [::]:7282->7282/tcp
services-ghost-rollup-proposer-1	Up 6 hours (healthy)	0.0.0.0:7272->7272/tcp, [::]:7272->7272/tcp
87acc574a7e2_services-ghost-relayer-1	Up 6 hours (healthy)	0.0.0.0:7171->7171/tcp, [::]:7171->7171/tcp
ghost_ai-monitor-l1	Up 6 hours (healthy)	7575/tcp, 0.0.0.0:7576->7576/tcp, [::]:7576->7576/tcp
ghost_ai-monitor-l3	Up 6 hours (healthy)	7575/tcp, 0.0.0.0:7577->7577/tcp, [::]:7577->7577/tcp
opstack-ghost-guard-1	Up 7 hours (healthy)	0.0.0.0:7070->7070/tcp, [::]:7070->7070/tcp
73154ea2073f_services-ghost-pil-worker-1	Up 7 hours	3220/tcp
services-ai-vault-1	Up 7 hours	0.0.0.0:7710->7710/tcp, [::]:7710->7710/tcp
services-ghost-pil-1	Up 7 hours (healthy)	0.0.0.0:3220->3220/tcp, [::]:3220->3220/tcp
8d2f8fd10b20_services-secrets-health-service-1	Up 7 hours	0.0.0.0:7618->7618/tcp, [::]:7618->7618/tcp
services-network-manager-service-1	Up 7 hours (healthy)	0.0.0.0:7766->7766/tcp, [::]:7766->7766/tcp
05122cf617cf_services-ai-clock-sync-1	Up 7 hours	0.0.0.0:7690->7690/tcp, [::]:7690->7690/tcp
a66a0638f841_services-explainability-service-1	Up 7 hours	0.0.0.0:7632->7632/tcp, [::]:7632->7632/tcp
e9893c20c572_services-key-rotation-service-1	Up 7 hours	0.0.0.0:7619->7619/tcp, [::]:7619->7619/tcp
e4fd3be7101a_services-anomaly-detection-service-1	Up 7 hours	0.0.0.0:7616->7616/tcp, [::]:7616->7616/tcp
1e6f2252d86a_services-payout-service-1	Up 7 hours	0.0.0.0:7629->7629/tcp, [::]:7629->7629/tcp
803a184243fd_services-transfer-lifecycle-service-1	Up 7 hours	0.0.0.0:7605->7605/tcp, [::]:7605->7605/tcp
dc9f06fbb749_services-tx-index-service-1	Up 7 hours	0.0.0.0:7625->7625/tcp, [::]:7625->7625/tcp
32b876a18f15_services-contract-risk-service-1	Up 7 hours	0.0.0.0:7609->7609/tcp, [::]:7609->7609/tcp
d8dd7ce75a5b_services-dispute-service-1	Up 7 hours	0.0.0.0:7607->7607/tcp, [::]:7607->7607/tcp
7ce084847de6_services-slashing-detection-service-1	Up 7 hours	0.0.0.0:7620->7620/tcp, [::]:7620->7620/tcp
a044abaa8c03_services-ghost-rpc-proxy-1	Up 7 hours	0.0.0.0:8546->8546/tcp, [::]:8546->8546/tcp
opstack-l3-op-proposer-1	Up 7 hours (healthy)	0.0.0.0:8302->8302/tcp, [::]:8302->8302/tcp, 0.0.0.0:39560->18560/tcp, [::]:39560->18560/tcp
opstack-l3-op-node-1	Up 7 hours (healthy)	0.0.0.0:8300->8300/tcp, [::]:8300->8300/tcp, 0.0.0.0:39546->19546/tcp, [::]:39546->19546/tcp
opstack-l3-op-batcher-1	Up 10 hours (healthy)	0.0.0.0:8301->8301/tcp, [::]:8301->8301/tcp, 0.0.0.0:39551->18551/tcp, [::]:39551->18551/tcp
opstack-l3-geth-1	Up 10 hours (healthy)	30303/tcp, 30303/udp, 0.0.0.0:39606->6060/tcp, [::]:39606->6060/tcp, 0.0.0.0:39545->8545/tcp, [::]:39545->8545/tcp, 0.0.0.0:39548->8546/tcp, [::]:39548->8546/tcp
services-ai-vault-dev-1	Up 17 hours	0.0.0.0:8200->8200/tcp, [::]:8200->8200/tcp
opstack-op-batcher-1	Up 33 hours (healthy)	0.0.0.0:7301->7301/tcp, [::]:7301->7301/tcp, 0.0.0.0:8551->8551/tcp, [::]:8551->8551/tcp
opstack-op-gate-l1-1	Up 33 hours (healthy)	0.0.0.0:28547->8545/tcp, [::]:28547->8545/tcp
opstack-ai-monitor-1	Up 18 hours (healthy)	0.0.0.0:7575->7575/tcp, [::]:7575->7575/tcp, 7600/tcp
opstack-op-gate-1	Up 33 hours (healthy)	0.0.0.0:28546->8545/tcp, [::]:28546->8545/tcp
opstack-op-proposer-1	Up 33 hours (healthy)	0.0.0.0:7302->7302/tcp, [::]:7302->7302/tcp, 0.0.0.0:8560->8560/tcp, [::]:8560->8560/tcp
opstack-op-sequencer-1	Up 18 hours (healthy)	0.0.0.0:7303->7303/tcp, [::]:7303->7303/tcp, 0.0.0.0:9646->9646/tcp, [::]:9646->9646/tcp
opstack-op-node-1	Up 19 hours (healthy)	0.0.0.0:7300->7300/tcp, [::]:7300->7300/tcp, 0.0.0.0:9546->9546/tcp, [::]:9546->9546/tcp
52d78ec0ec5b_opstack-l2-geth-1	Up 19 hours (healthy)	30303/tcp, 30303/udp, 0.0.0.0:29606->6060/tcp, [::]:29606->6060/tcp, 0.0.0.0:29547->8545/tcp, [::]:29547->8545/tcp, 0.0.0.0:29548->8546/tcp, [::]:29548->8546/tcp
ghostchain-ghostchain-rpc-proxy-1	Up 37 hours (healthy)	8546/tcp, 0.0.0.0:18545->8545/tcp, [::]:18545->8545/tcp
ghostchain-ghostchain-node1-1	Up 37 hours (healthy)	8545/tcp, 30303/udp, 0.0.0.0:18660->6060/tcp, [::]:18660->6060/tcp, 0.0.0.0:18546->8546/tcp, [::]:18546->8546/tcp, 0.0.0.0:18552->8551/tcp, [::]:18552->8551/tcp, 0.0.0.0:18551->30303/tcp, [::]:18551->30303/tcp
ghostchain-ghostchain-bootnode-1	Up 37 hours	8545-8546/tcp, 30303/tcp, 0.0.0.0:30301->30301/udp, [::]:30301->30301/udp, 30303/udp
infra-prometheus-1	Up 41 hours	0.0.0.0:9090->9090/tcp, [::]:9090->9090/tcp
infra-grafana-1	Up 41 hours	0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
infra-alertmanager-1	Up 41 hours	0.0.0.0:9093->9093/tcp, [::]:9093->9093/tcp
infra-loki-1	Up 41 hours	0.0.0.0:3100->3100/tcp, [::]:3100->3100/tcp
ghostchain-ghostchain-node2-1	Up 41 hours	8545-8546/tcp, 30303/tcp, 30303/udp
services-pil-postgres-1	Up 42 hours (healthy)	0.0.0.0:5434->5432/tcp, [::]:5434->5432/tcp
services-gas-engine-redis-1	Up 42 hours (healthy)	0.0.0.0:6381->6379/tcp, [::]:6381->6379/tcp
services-gas-engine-postgres-1	Up 42 hours (healthy)	0.0.0.0:5433->5432/tcp, [::]:5433->5432/tcp
services-rpc-forward-l1-29545-1	Up 42 hours	0.0.0.0:29545->29545/tcp, [::]:29545->29545/tcp
opstack-l1-rpc-proxy-1	Up 33 hours (healthy)	
ghostchain-compliance-ghost-compliance-worker-1	Up 2 days	
ghostchain-compliance-ghost-compliance-1	Up 2 days (healthy)	0.0.0.0:8090->8090/tcp, [::]:8090->8090/tcp
ghostchain-agents-docs-agent-1	Up 2 days	7702/tcp
ghostchain-agents-coder-agent-1	Up 2 days	7702/tcp
ghostchain-agents-watchdog-agent-1	Up 2 days	7702/tcp
ghostchain-agents-auditor-agent-1	Up 2 days	7702/tcp
ghostchain-agents-ops-agent-1	Up 2 days	7702/tcp
ghostchain-agents-planner-agent-1	Up 2 days	7702/tcp
ghostchain-agents-router-agent-1	Up 2 days	7702/tcp
ghostchain-agents-agent-registry-1	Up 2 days	0.0.0.0:7701->7701/tcp, [::]:7701->7701/tcp
ghostchain-compliance-postgres-1	Up 2 days (healthy)	0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
ghostchain-compliance-redis-1	Up 2 days (healthy)	0.0.0.0:6379->6379/tcp, [::]:6379->6379/tcp
```

### docker compose ls
```
[{"Name":"ai-monitor","Status":"running(2)","ConfigFiles":"/home/ghost/ghostl-stack/services/ai-monitor/docker-compose.yml"},{"Name":"ghostchain","Status":"running(4)","ConfigFiles":"/home/ghost/ghostl-stack/infra/ghostchain/docker-compose.l1.yml"},{"Name":"ghostchain-agents","Status":"running(10)","ConfigFiles":"/home/ghost/ghostl-stack/docker-compose.agents.yml"},{"Name":"ghostchain-compliance","Status":"running(4)","ConfigFiles":"/home/ghost/ghostl-stack/docker-compose.yml"},{"Name":"infra","Status":"running(4)","ConfigFiles":"/home/ghost/ghostl-stack/observability/infra/docker-compose.yml"},{"Name":"opstack","Status":"running(14)","ConfigFiles":"/home/ghost/ghostl-stack/infra/opstack/docker-compose.yml,/home/ghost/ghostl-stack/infra/opstack/docker-compose.l3.yml"},{"Name":"services","Status":"running(63)","ConfigFiles":"/home/ghost/ghostl-stack/services/docker-compose.legacy.yml"}]
```
