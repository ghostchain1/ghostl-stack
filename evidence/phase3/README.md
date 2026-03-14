# Phase 3 Evidence Index

Generated: 2026-02-21

## Files
- `bridge-hub-build.txt` — `ghostchain-bridge-hub` TypeScript build output.
- `relayer-check.txt` — `ghost-relayer` TypeScript check output.
- `bridge-service-syntax-check.txt` — `bridge-service` JavaScript syntax validation output.
- `routing-guard-tests.txt` — shared routing guard automated test run.
- `routing-chaos-matrix.json` — transition matrix showing allowed and blocked routes.

## Gate-relevant pointers
- L3 direct to L1 blocked: `routing-guard-tests.txt` (test: "blocks direct L3 to L1 transition").
- Route matrix confirmation: `routing-chaos-matrix.json` (`L3 -> L1` marked blocked).
- Service integration validity: `bridge-hub-build.txt`, `relayer-check.txt`, `bridge-service-syntax-check.txt`.
