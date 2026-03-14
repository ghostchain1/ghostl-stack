# GhostL-Stack Audit Report
Date: February 27, 2026
Scope: `/home/ghost/ghostl-stack` (repo-wide health, SSO/gateway rollout status, security/dependency posture)

## 1) Summary
- Overall status: `Partially complete` with strong progress on 3-realm auth/gateway wiring.
- Main success: realm-based web login flow, Kong realm ACL/JWT enforcement, Keycloak realm templates, and CI smoke coverage are in place and passing.
- Main blockers: unresolved dependency vulnerabilities, OSS Kong fallback (no direct Keycloak JWKS/OIDC validation), and incomplete end-to-end production validation across all core services.

## 2) What Is Completed
- 3-realm SSO foundation in web app:
  - dynamic realm selection and login routing
  - realm-aware session token handling
  - route protection by realm
  - shared realm config centralization
- Gateway auth enforcement:
  - Kong declarative config with realm-scoped `jwt + acl` route policies
  - request correlation-id and route-level rate limits
  - production compose wiring for Kong/Traefik and env-based JWT secrets
- Realm templates:
  - Keycloak realm export files for `ghost-users`, `ghost-employees`, `ghost-admins`
  - environment templates updated for SSO/gateway settings
- Observability/smoke checks added:
  - web realm-login smoke script
  - Kong realm auth matrix smoke script
  - CI workflow wiring for both smoke gates
  - public web health endpoint (`/health`)

Recent completed commits (audit-relevant):
- `48bee4063` feat(web): add 3-realm SSO with dynamic Keycloak issuer
- `3951b362a` feat(infra): add Kong OIDC and production compose wiring
- `1c126f975` feat(auth): add Keycloak realm export templates and env examples
- `349aae78e` fix(infra): make kong OSS jwt fallback enforce realm ACLs
- `b775d837b` ci(smoke): add kong realm auth gateway check
- `508a5d6c7` test(web-auth): add realm-login smoke and CI gate
- `57f0665b4` refactor(web-auth): centralize realm routing config
- `1e2b5f6af` feat(web): add public health endpoint and smoke coverage

## 3) What Is Working (Validated)
Validated on February 27, 2026 via local command execution:

- Routing/Governance guards:
  - `npm run verify:routing` -> `PASS`
  - `npm run verify:governance` -> `PASS`
- Web auth flow:
  - `npm run smoke:web:realm-login` -> `PASS`
  - includes safe/unsafe `returnTo` behavior and protected-route redirect checks
- Gateway realm auth:
  - `npm run smoke:kong:auth -- /tmp/ghoststack-sso.env` -> `PASS`
  - expected `401/403` behavior validated by realm
- Build:
  - `npm run build` (apps/api + apps/web) -> `PASS`
- Compose config:
  - `docker compose -f infra/docker/docker-compose.prod.yml --env-file /tmp/ghoststack-sso.env config` -> `PASS`
- Runtime gateway containers:
  - `traefik` and `kong` are up, with Kong healthy.

## 4) What Is Not Working (Validated Issues)
- Dependency security posture is failing:
  - `npm audit --json` exits non-zero.
  - Current result: `9` vulnerabilities (`1 critical`, `2 high`, `2 moderate`, `4 low`).
  - Notable affected packages include `basic-ftp`, `systeminformation`, `minimatch`, `@auth/core`, `pm2`.
- “No deprecated/vulnerable deps” target is not met:
  - `npm run deprecations:check` exits zero with empty `items`, but generated checks show:
    - `npmOutdated.code = 1`
    - `npmAudit.code = 1`
  - This means the script does not currently fail the pipeline for those findings.
- Gateway is not using direct OIDC/JWKS token validation:
  - Current Kong mode is OSS fallback (`jwt + acl`) with HMAC secrets.
  - This is functional but not equivalent to direct Keycloak discovery/JWKS verification at gateway.
- End-to-end SSO is not fully proven against live IdP + full stack:
  - realm login redirects and gateway policy are verified
  - full browser login journey against live Keycloak realms (including MFA) is not yet validated in this audit run.

## 5) What Still Needs Completion
- Security/dependency remediation:
  - upgrade or override vulnerable packages until `npm audit` is clean (or explicitly risk-accepted with documented exceptions)
  - update `scripts/check-deprecations.mjs` to fail when `npmAudit`/`npmOutdated` checks fail
- Identity hardening:
  - implement/verify nonce-signature wallet ownership proof flow for user self-linking
  - enforce and verify MFA policies for employee/admin realms in imported Keycloak config
- Gateway hardening:
  - move from OSS HMAC fallback to true OIDC/JWKS validation path in production (Kong Enterprise plugin or sidecar verifier)
  - add claim-level authorization at gateway where needed (`realm`, role/capability claims)
- End-to-end validation:
  - run full production compose stack with key services (`web`, `keycloak`, `kong`, `identity-service`, `governance-service`) and perform integrated smoke/e2e
  - add automated e2e for real realm login + callback + protected route access
- Architecture completion:
  - continue convergence from legacy session auth to unified NextAuth realm model across all protected web/API paths
  - complete any remaining routing-law enforcement checks at service layer (beyond existing routing/governance scripts)

## 6) Current Working/Not Working Matrix
- Completed and working now:
  - realm-based web auth routing
  - proxy realm partition checks
  - Kong realm ACL/JWT enforcement
  - routing/governance validation scripts
  - CI smoke coverage for web realm-login and Kong realm auth
- Implemented but incomplete for production target:
  - OIDC/JWKS verification at gateway
  - full live Keycloak/MFA e2e verification
  - dependency vulnerability closure
  - deprecation audit gate strictness

