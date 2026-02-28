# Keycloak MFA Enforcement (Employees/Admins)

GhostStack enforces MFA policy at the realm template layer for:

- `ghost-employees`
- `ghost-admins`

## What is enforced

Realm export templates set:

- `otpPolicyType: totp`
- `CONFIGURE_TOTP` required action enabled and defaulted
- brute-force protections (`bruteForceProtected`, `failureFactor`)

Files:

- `infra/keycloak/realm-exports/ghost-employees-realm.json`
- `infra/keycloak/realm-exports/ghost-admins-realm.json`

## Production expectation

- Employees/Admins must complete OTP enrollment at first login.
- Realms should be imported via controlled bootstrap (IaC or admin job).
- Use unique client secrets (do not use repository placeholders).

## Test-mode relaxation

Automated gateway/e2e smoke tests may use the `ghost-e2e-cli` service-account client to obtain non-interactive tokens.
This is explicit test-only behavior and does not remove realm MFA requirements for human user logins.

## Validation commands

```bash
# Verify realm metadata includes OTP policy
rg -n "otpPolicyType|CONFIGURE_TOTP|defaultAction" infra/keycloak/realm-exports/ghost-*.json
```
