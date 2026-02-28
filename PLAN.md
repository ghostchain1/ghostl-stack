# GhostStack Apps Integration Plan (Phase 0 Baseline + Phase 1 Start)

Generated: 2026-02-26 (local)

## Scope
- Target analyzed: `/home/ghost/ghostl-stack/apps`
- Integration target: `/home/ghost/ghostl-stack`
- Constraints applied: no destructive data changes, minimal churn, routing law guardrails (`L3 -> L2`, `L2 -> L1`, no `L3 -> L1` bypass)

## Phase 0 Baseline Inventory

### A) Monorepo/tooling inventory
- Workspace roots in use:
  - `apps/api`
  - `apps/web`
  - `apps/worker`
  - `packages/*`
- Current package manager execution path: npm (root lockfile is `package-lock.json`; CI and Docker use `npm ci`)
- Node pinning:
  - `.nvmrc`: `22.21.0`
  - `package.json` engines: `>=22.21.0 <23`
  - CI workflows pin `22.22.0`
- Framework/runtime:
  - `apps/web`: Next.js `16.1.6`, React `19.2.4`, App Router, proxy middleware
  - `apps/api`: Express `5.2.1`, TypeScript, `express-session`, SQLite-backed auth/session stores
  - `apps/worker`: Node TypeScript worker + BullMQ
- Shared config detected:
  - Root ESLint config: `eslint.config.mjs`
  - Root Prettier config: `.prettierrc`
  - Shared TypeScript base: `tsconfig.base.json`
  - Shared UI package exists (`packages/ui`), but not Tailwind/shadcn-based yet

### B) Runtime dependency graph (apps -> services/chains)

| App | Primary upstreams | Notes |
|---|---|---|
| `apps/web` | `apps/api` (`resolveApiBase`) | Primary BFF/API source for app features |
| `apps/web` | compliance (`8090`), gas engine (`3210`), PIL (`3220`), AI attestor (`3310`) | Direct service calls/proxies also exist |
| `apps/web` | GhostScout L1/L2/L3 explorer APIs | Via `app/api/explorer/[chain]/[[...path]]/route.ts` |
| `apps/api` | bridge/transfers/liquidity/contracts/risk/governance/devops/treasury/validator/AI/swap services | URLs injected from `apps/api/src/config/env.ts` |
| `apps/api` | RPC registry + chain RPCs (L1/L2/L3) | Used for chain reads and wallet operations |
| `apps/worker` | health endpoints + Redis + optional queue | Operational worker/health orchestration |

### C) Current auth wiring map
- Current model: server-side session auth (`express-session`) with RBAC permissions from SQLite store.
- Login endpoints:
  - `/api/auth/login` (password)
  - `/auth/login/password` (password)
  - `/auth/login/sso` (shared-secret JWT validation via `SSO_JWT_SECRET`)
- Route protection:
  - Web-level proxy middleware checks session and role policy
  - API-level `requirePermission(...)` middleware checks coarse/fine permissions
- Gap vs target:
  - No OIDC IdP-based 3-realm SSO (Users/Admins/Employees)
  - No JWKS-based token validation path at gateway + service layer
  - No realm claim model in session/token contracts
  - Wallet linking exists, but lacks nonce-signature verification workflow

### D) Environment variable map (high-level)
- `apps/web`: API base URLs, service URLs, explorer URLs, L1/L2/L3 RPC + chain IDs, feature flags, tokens, auth debug flags
- `apps/api`: full service URL matrix, session/auth settings, chain metadata, vault integration vars, governance/treasury/contract vars, ghostwallet vars
- `apps/worker`: health URLs, queue/redis config, compliance cache config

### E) Build/test command inventory and baseline status
- `npm run node:check` ✅
- `npm run deprecations:check` ✅ (report generated)
- `npm run lint` ✅
- `npm run build -w apps/api` ✅
- `npm run build -w apps/web` ✅
- `npm run build -w apps/worker` ✅
- `npm run verify:routing` ✅ (`routing_verify:PASS`)
- `npm --prefix packages/routing-guard test` ✅
- Not executed in this pass:
  - full Playwright e2e run
  - full docker compose smoke for entire stack

### F) Deprecation/security baseline findings
- Deprecations report: `artifacts/deprecations.json`
  - `items: []` (no immediate deprecated API/package hits from scanner)
  - `npmOutdated` returned non-zero
  - `npmAudit` returned non-zero
- `npm outdated -ws --json` notable:
  - `@types/node` patch update available
  - `@types/helmet` entry shows metadata mismatch (package itself is effectively legacy)
- `npm audit --json --omit=dev`:
  - low: `qs`
  - moderate: `bn.js`
  - fix available for both

## Risk Ranking

| Risk | Severity | Why |
|---|---|---|
| No realm-based OIDC SSO (Users/Admins/Employees) | High | Blocks required trust boundaries and true realm-wide SSO |
| Shared-secret SSO (`SSO_JWT_SECRET`) instead of JWKS/OIDC | High | Weakens key rotation and central token governance |
| Routing-law not uniformly enforced in app/service request paths | High | Policy package exists but not fully wired in runtime paths |
| Mixed manager signals (npm lock + pnpm workspace file in repo) | Medium | Tooling drift risk across local/CI/devcontainer workflows |
| No dedicated API gateway layer for JWT/JWKS/rate-limit/cors policy | Medium | Coarse controls distributed across app code only |
| Wallet-link flow missing nonce-signature verification | Medium | Identity-wallet binding not cryptographically proven end-to-end |
| CSP/security headers not centralized at web edge | Medium | Defense depth gap for browser-facing entrypoint |

## Target-Structure Alignment (provided north-star)
- Your proposed target layout (realm route groups, `packages/auth`, `packages/api-client`, `services/auth`, `services/gateway`, routing-policy module) is consistent with the required end-state.
- Current repo already has many target-adjacent pieces (Next shell, RBAC, routing guard package, service mesh), so migration can be incremental rather than big-bang.

## Phase 1 (Minimal-Churn) Changes Applied
- Enforced deterministic Node/tooling guardrails without changing runtime architecture:
  - Added root `packageManager` metadata (`npm@10.9.4`) to lock install toolchain behavior.
  - Added preinstall guardrail chain:
    - `node scripts/node-check.mjs && node scripts/package-manager-check.mjs`
  - Added package-manager gate script:
    - `scripts/package-manager-check.mjs`
    - Blocks unsupported lockfiles and non-npm installers in current repo mode.
  - Added `tooling:check` script for CI/local consistency:
    - `npm run node:check && node scripts/package-manager-check.mjs`

## Ordered Atomic Commit Sequence (proposed)
1. `chore(tooling): enforce deterministic node/npm workspace policy`
2. `docs(plan): add Phase-0 wiring baseline and phased migration plan`
3. `feat(auth): introduce OIDC provider integration scaffold and realm contract types`
4. `feat(auth): add realm-aware session middleware and role claim mapping`
5. `feat(identity): implement nonce-signature wallet linking with audit trail`
6. `feat(gateway): add JWT/JWKS validation, rate limits, CORS and request-id policy`
7. `feat(routing): wire routing-law guards in bridge/wallet/service edges`
8. `feat(ui): add realm route groups and role-aware navigation in Next shell`
9. `feat(packages): introduce shared api-client and auth helper packages`
10. `chore(security): tighten CSP/headers and state-change CSRF policies`
11. `chore(deps): remediate audit findings and patch outdated type deps`
12. `ci(release): add end-to-end smoke + compose checks + rollback checklist`

## Migration Notes / Rollback
- Current edits are non-destructive and reversible by reverting:
  - `package.json`
  - `scripts/package-manager-check.mjs`
- No schema/data migrations or key material changes were introduced in this pass.
