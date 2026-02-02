# GhostL Stack Docs

Use this index to find the right runbook or reference quickly.

- **Operate the stack**
  - `ai-guard-opstack.md`: Guard/Relayer wiring for OP Stack deployments.
  - `opstack-l3-testnet-deployment-checklist.md`: battle-tested L3→L2→L1 rollout checklist and scripts.
  - `opstack-role-config.md`: operational roles and RPC/key expectations.
  - `production-readiness.md`: pre-launch safety checks and observability requirements.
  - `opstack-l1-mainnet-geth.md`: L1 geth config for OP Stack anchoring.
- **Architecture & design**
  - `dashboard-architecture.md`: UI + service layout for the operator dashboard.
  - `route-map-and-services.md`: page-to-service mapping for every module.
  - `opstack-l2-architecture.md`, `opstack-l2-l3-stack.md`: L2/L3 stack diagrams and data flow.
  - `ghostchain-ibft.md`, `ghostchain-l1.md`, `ghostchain-opstack-blueprint.md`, `ghostchain-l2-recommendation.md`: chain design notes and recommended configs.
  - `l2-roadmap.md`, `opstack-migration-plan.md`, `zk-upgrade.md`: forward-looking plans and upgrade paths.
- **Security & secrets**
  - `SECRETS.md`: where secrets live, how to populate `.env`, and what never belongs in git.
- **Operations**
  - `ops/README.md`: ops directory guide and links to runbooks/release tooling.
- **Checklists & templates**
  - `checklists/README.md`: consolidated pointers to dev and Ops checklists.
  - `ghostchain-management.md`: full-stack blueprint for the L1/L2/L3 management system (users, wallets, validators, observability).
  - `ghostchain-wiring.md`: how to point the stack at live GhostChain RPCs and services.

Tip: keep `docs` open in your editor sidebar; file names match the module names in `apps/web/src/modules` and `services/`.
