# Usage (skeleton)

## Queue a SAFE restart

From the UI:

- Open `http://localhost:7400`
- Go to **Actions**
- Submit a service name (must be allowlisted by Policy)

From curl:

```bash
curl -sS -X POST http://localhost:7401/actions/request \
  -H 'content-type: application/json' \
  -d '{
    "requestedBy": "manual",
    "riskMode": "SAFE",
    "scope": {"workspaceRoot": "/workspace", "services": ["ghostcontrol-api"]},
    "requestedActions": [{"kind":"docker.restart_service","params":{"service":"ghostcontrol-api"}}]
  }'
```

Then watch evidence:

- `GET http://localhost:7401/evidence`

AI consensus safety toggle:

- Config: `tools/ghostcontrol/guards/config/ai-consensus-safety-mode.json`
- Operational notes: `tools/ghostcontrol/docs/ai-consensus-safety-mode.md`
- Cascading finality config: `tools/ghostcontrol/guards/config/cascading-finality-safe-mode.json`
- Cascading finality notes: `tools/ghostcontrol/docs/cascading-finality-safe-mode.md`
