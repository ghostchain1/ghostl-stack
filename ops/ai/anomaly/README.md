# AI Anomaly Detection (Deterministic)

This directory is populated by `ghostctl-recreate.sh` with deterministic anomaly analysis artifacts:

- `anomaly-report.json`
- `model-metadata.json`

No production data is used for training. The analysis is rule-based and deterministic.

Severity levels:
- INFO: No actionable variance detected.
- WARN: RPC errors or inconsistent telemetry signals detected.
- CRITICAL: Chain safety invariants violated (triggers kill switch + rollback).
