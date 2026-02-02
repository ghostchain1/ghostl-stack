# AI Threat Model Generation

This module generates deterministic STRIDE and LINDDUN threat models based on the current Docker composition and runtime artifacts.

Artifacts (generated at runtime):
- `stride-model.md`
- `linddun-model.md`
- `risk-summary.json`

Run:
```
./ops/ai/threat-model/generate.sh --mode prod --snapshot ./ops/docker/snapshots/<timestamp>
```

If the risk summary severity is CRITICAL, the recreate pipeline aborts.
