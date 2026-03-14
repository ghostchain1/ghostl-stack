# Usage (skeleton)

## CLI

Run from `tools/ghostcontrol`:

```bash
bash bin/ghostcontrol.sh up
bash bin/ghostcontrol.sh status
bash bin/ghostcontrol.sh logs ghostcontrol-api
bash bin/ghostcontrol.sh doctor ../../evidence/phase1
bash bin/ghostcontrol.sh backup ../../evidence/phase1/backups
bash bin/ghostcontrol.sh restore ../../evidence/phase1/backups/<archive>.tar.gz
bash bin/ghostcontrol.sh down
```

Equivalent npm script shortcuts:

```bash
pnpm cli -- status
pnpm doctor
pnpm backup
```

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
