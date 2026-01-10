# Secrets Handling

- **Storage**: Use a secrets manager (Vault/KMS/HSM) for long-lived keys. Do not commit secrets; `.env` files are for local dev only.
- **Injection**: Prefer environment variables injected by the platform (CI, container orchestrator). Keep `.env.example` up to date for local use.
- **Rotation**: Keys with signing ability (validators, relayers, proposers) must be rotatable; track rotation in audit logs. Automate rotation where possible.
- **Access control**: Restrict read/write access to secrets via RBAC; log access and mutations.
- **Transport**: Always use TLS for secret retrieval; avoid passing secrets via CLI arguments (use env or files with tight permissions).
- **Auditing**: Emit audit entries for secret reads/writes/rotations in `audit-log-service`; include actor, purpose, and correlation ID.
- **Build/CI**: CI jobs should consume secrets from the CI store, not from repo files. Fail fast if required secrets are missing.
