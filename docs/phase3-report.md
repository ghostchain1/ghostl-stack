# Phase 3 — Routing Lock & Finality Path Enforcement

Date: 2026-02-21

## Goal
Enforce hard routing invariants so GhostL3 cannot directly settle to GhostL1, while preserving valid hierarchical transitions through GhostL2.

## Changes delivered

### 1) Shared routing guard package
Created a reusable policy package for transition and egress enforcement.

Files:
- `packages/routing-guard/package.json`
- `packages/routing-guard/index.js`
- `packages/routing-guard/index.d.ts`
- `packages/routing-guard/test/routing-guard.test.js`

Core rules:
- Allowed transitions: `L3->L2`, `L2->L1`, `L1->L2`, `L2->L3`
- Blocked transitions: all others, including `L3->L1`
- External egress allowed only from `L1`

### 2) Bridge hub enforcement
Integrated shared guard checks into route-critical endpoints.

File:
- `services/ghostchain-bridge-hub/src/server.ts`

Added/updated:
- `POST /roots/l2` enforces `L2->L1`
- `POST /roots/l3` enforces `L3->L2`
- `POST /egress` enforces `L1->external`
- `POST /route/validate` operator validation endpoint

### 3) Relayer policy exposure + checks
Integrated route assertions and endpoint allowlist enforcement.

File:
- `services/ghost-relayer/src/index.ts`

Added/updated:
- startup route assertions for `L2->L3` and `L3->L2` intent flows
- RPC endpoint allowlist checks for configured L2/L3 endpoints
- `GET /routing-policy` endpoint returning allowed and blocked transitions

### 4) Bridge service operator validation endpoint
Added admin route validation endpoint backed by shared guard.

File:
- `services/bridge-service/src/index.js`

Added:
- `POST /bridges/route/validate`

### 5) Routing policy documentation
Documented policy and all enforcement points.

File:
- `docs/routing-policy.md`

## Validation + evidence
- Bridge hub build: `evidence/phase3/bridge-hub-build.txt`
- Relayer typecheck: `evidence/phase3/relayer-check.txt`
- Bridge service syntax check: `evidence/phase3/bridge-service-syntax-check.txt`
- Routing guard tests: `evidence/phase3/routing-guard-tests.txt`
- Chaos transition matrix: `evidence/phase3/routing-chaos-matrix.json`
- Evidence index: `evidence/phase3/README.md`

## Gate 3 assessment
Gate rule: automated proofs show that direct `L3 -> L1` routing is blocked and only hierarchical transitions are allowed.

Status: **PASS**

Reason:
- Automated test explicitly validates `L3 -> L1` is rejected.
- Matrix artifact confirms `L3 -> L1` blocked while required hierarchical transitions remain allowed.
- Service code paths now consume the same shared guard policy, reducing drift and bypass risk.
