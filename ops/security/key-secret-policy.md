# Key and Secret Policy (Testnet)

## Required Rules
- No private keys, mnemonics, JWT secrets, or Vault root tokens in git
- Use `.env.*.example` templates only in repository
- Runtime secrets must be provided through Vault agent/docker secrets
- Validator and signer keys must be mounted read-only and excluded from images

## Rotation Requirements
- Rotate all leaked testnet keys before deployment
- Rotate all leaked API/admin tokens before deployment
- Record rotation evidence in `.audit/reports/` and CI artifacts

## CI Gate
- Secret scanners must pass: gitleaks/trivy/trufflehog
- Any HIGH/CRITICAL secret finding => NO-GO
