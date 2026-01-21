# ghost-compliance-worker

Background worker that computes compliance predictions from laws, policies, and decision signals.

## Run

```bash
npm install
npm run dev
```

## Environment

See `.env.example`.

Outputs are stored in `compliance_predictions` and surfaced via `/v1/predictions`.
