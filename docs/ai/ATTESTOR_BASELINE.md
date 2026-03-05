# AI Attestor Service Baseline (Phase A)

This baseline summarizes how services are structured and composed in this repo, and how a new `ghost-ai-attestor` service can fit without destructive changes.

## Existing Service Conventions (Observed)

- Services live under `services/<name>/`.
- Many services use Express and expose a health endpoint at `/health` (for example `services/mempool-service/src/index.js`).
- TypeScript services commonly use `dotenv/config` and run via `ts-node` in dev-like setups (for example `services/ghost-rollup-proposer/src/index.ts` and `services/ghost-rollup-proposer/package.json`).
- Per-service compose files under `services/<name>/docker-compose.yml` typically:
  - use `entrypoint.sh` and `healthcheck.sh`
  - mount a local `data/` directory
  - join the external `ghost_net` network
- A root helper builds services sequentially from a compose file: `scripts/build-services-sequential.sh`.
- The unified compose overlays under `infra/docker/compose/` are JSON-shaped YAML and are explicitly intended for additive, non-destructive changes (see `infra/docker/compose/README.md`).

## Chosen Service Folder Name

- Proposed new service path: `services/ghost-ai-attestor/`.
- This matches existing naming conventions (`ghost-*`, `ai-*`).
- This keeps the service discoverable alongside other AI and control-plane services.

## Shared Libraries and Patterns to Reuse

- HTTP server pattern: Express.
- EVM client: `ghost` v6 (already used across services).
- Environment loading: `dotenv/config`.
- Operational scripts: follow the `entrypoint.sh` and `healthcheck.sh` pattern used by `services/mempool-service/`.
- Logging: structured `console.log` lines consistent with existing services.

## Environment Variable Patterns

- Per-service compose files often load a local `.env` file via `env_file: .env`.
- The unified compose overlays load `infra/docker/compose/stack.env`.
- A shared stack env template exists at `services/stack.env.example`, and a live local variant exists at `services/stack.env`.
- `apps/api` seeds contract addresses and chain metadata by reading `services/stack.env` and `apps/web/.env.local` (see `apps/api/src/server.ts` `loadSeedEnv`).

## Compose Integration Plan (Non-Destructive)

- Primary compose integration target: `infra/docker/compose/docker-compose.ai.yml`.
- The new service will live at `services/ghost-ai-attestor/`.
- The AI overlay will reference the service using a relative build context: `../../../services/ghost-ai-attestor`.
- Selected service port: `3310` (no collisions found in `services/`, `apps/`, `infra/opstack/`, or `infra/docker/compose/`).
- A named volume will be added to the AI overlay for nonce persistence: `ghost_ai_attestor_nonce_store`.
- A per-service compose file at `services/ghost-ai-attestor/docker-compose.yml` will also be added to match existing service conventions and allow targeted local runs without modifying existing stacks.

## Contract Address and Layer Wiring Plan

- RPC URLs will be configured via `RPC_URL_L1`, `RPC_URL_L2`, and `RPC_URL_L3`.
- To align with existing stack variables, `RPC_L1`, `RPC_L2`, and `RPC_L3` will be accepted as fallbacks.
- AI registry addresses will be configured via `AI_ORACLE_REGISTRY_ADDRESS_L1`, `AI_ORACLE_REGISTRY_ADDRESS_L2`, and `AI_ORACLE_REGISTRY_ADDRESS_L3`.
- Attestation hub addresses will be configured via `AI_ATTESTATION_HUB_ADDRESS_L1`, `AI_ATTESTATION_HUB_ADDRESS_L2`, and `AI_ATTESTATION_HUB_ADDRESS_L3`.
- Layer defaults and attestation controls will be configured via `AI_LAYER_DEFAULT`, `AI_MODEL_VERSION`, `AI_ATTESTATION_TTL_SECONDS`, and `AI_NONCE_STORE_PATH`.
- All values will be injected via environment variables; no chain resets or genesis changes are required.

## Evidence

- Attestor discovery log: `docs/evidence/ai-pack/build_logs/attestor.log`.
