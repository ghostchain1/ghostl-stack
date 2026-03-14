# GhostL Stack Docs

Use this index to find the right runbook or reference quickly.

- **Operate the stack**
  - `ai-guard-opstack.md`: Guard/Relayer wiring for OP Stack deployments.
  - `opstack-l3-testnet-deployment-checklist.md`: battle-tested L3→L2→L1 rollout checklist and scripts.
  - `opstack-role-config.md`: operational roles and RPC/key expectations.
  - `production-readiness.md`: pre-launch safety checks and observability requirements.
  - `opstack-l1-mainnet-geth.md`: L1 geth config for OP Stack anchoring.
- **Architecture & design**
  - `ARCHITECTURE.md`: full Liquidity Gravity Engine architecture.
  - `dashboard-architecture.md`: UI + service layout for the operator dashboard.
  - `architecture/system_overview.md`: overall chain + AI topology diagram.
  - `architecture/interchain-flow.md`: Phase 1 Low Balancer interchain flow (L1→L2→L3) + non-bypass governance rules.
  - `architecture/interchain-policy-layer.md`: Phase 2 AI Risk Engine + policy gates + Liquidity/Bridge Routers.
  - `architecture/phase3-containers.md`: Phase 3 hardened Docker/Compose.
  - `architecture/phase4-governance.md`: Phase 4 governance/contracts.
  - `architecture/ghostchain-ai-governance-whitepaper.md`: AI governance authority model.
  - `architecture/ghostchain-compliance-whitepaper.md`: compliance decision flow.
  - `route-map-and-services.md`: page-to-service mapping for every module.
- **AI + Autonomous Systems**
  - `ai-core/architecture.md`: GhostBrain OS internals (supervisor, swarm, integration).
  - `ai-core/autonomy-modes.md`: safe autonomy modes, circuit-breakers, dry-run.
  - `ai-core/safety-guarantees.md`: invariants, policy guard, human-ratification requirement.
  - `ai-core/operator-playbook.md`: AI operator runbook.
  - `ai-core/federation.md`: GhostBrain multi-node federation.
  - `ai-core/model-lock.md`: model version locking policy.
  - `ai/AI_TOOLCHAIN.md`: AI toolchain reference.
  - `ai/AI_PACK_BASELINE.md`: AI agent capability baseline.
- **Whitepapers**
  - `Autonomous_Treasury_Whitepaper.md`: fully autonomous treasury system.
  - `WHITEPAPER_CONSTITUTIONAL_GOVERNANCE.md`: constitutional governance model.
  - `WHITEPAPER_LIQUIDITY_GRAVITY.md`: Liquidity Gravity Engine design.
  - `architecture/ghostchain-ai-governance-whitepaper.md`: AI governance model.
  - `architecture/ghostchain-compliance-whitepaper.md`: compliance whitepaper.
- **Security & secrets**
  - `SECRETS.md`: where secrets live, how to populate `.env`, and what never belongs in git.
  - `SECURITY.md`: threat model, incident response, and security report.
  - `THREAT_MODEL.md`: full threat model.
- **Economics**
  - `econ/baseline.md`: economic baseline and GST emission model.
  - `econ/commit-runbook.md`: economics commit runbook.
  - `GST_GAS_TOKEN_EVERYWHERE.md`: GST as universal gas token across L1/L2/L3.
- **Operations**
  - `ops/README.md`: ops directory guide and links to runbooks/release tooling.
  - `RUNBOOK.md`: operational runbook.
  - `INCIDENT_RESPONSE.md`: incident response guide.
- **Checklists & templates**
  - `checklists/README.md`: consolidated pointers to dev and ops checklists.
  - `checklists/WHAT_YOU_CAN_RUN_TODAY.md`: what to run today.
  - `checklists/RELEASE_GATE.md`: release gate checklist.
  - `DEV_SETUP.md`: full developer setup guide.

Tip: keep `docs` open in your editor sidebar; file names match the module names in `apps/web/src/modules` and `services/`.
