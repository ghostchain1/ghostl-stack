# Keycloak Realm Templates (GhostStack)

These are starter realm export templates for:
- ghost-users
- ghost-employees
- ghost-admins

Employee/Admin realms include MFA policy defaults (`CONFIGURE_TOTP` required action).

## Import (example)
Inside the Keycloak container, you can import a realm JSON by mounting it and using:
- `kc.sh import --file /path/to/realm.json`

For production, prefer configuring realms via IaC or an admin bootstrap job.

The templates also include a non-interactive `ghost-e2e-cli` client for gateway/JWKS smoke tests.
Use a unique secret outside local/dev.

## Required env for apps/web
- KEYCLOAK_BASE_URL=https://auth.ghostchain.cloud
- KEYCLOAK_REALM_USERS=ghost-users
- KEYCLOAK_REALM_EMPLOYEES=ghost-employees
- KEYCLOAK_REALM_ADMINS=ghost-admins
- KEYCLOAK_CLIENT_ID=ghost-web
- KEYCLOAK_CLIENT_SECRET=... (do not commit)
- KONG_E2E_CLIENT_ID=ghost-e2e-cli
- KONG_E2E_CLIENT_SECRET=... (do not commit)
