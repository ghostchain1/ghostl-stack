# Security & Compliance Module

Pages
- Security Overview (risk score)
- Validator Keys (rotation status)
- Vault/HSM Health
- Slashing Risk
- Attack Surface
- Compliance Reports

Services
- SecretsHealthService (Vault seal/unseal, latency, errors)
- KeyRotationService
- SlashingDetectionService
- ComplianceExportService (CSV/JSON/PDF)

Data models
- RiskSignal { source, severity, score, evidence }
- KeyRef { validatorId, type, rotatedAt, expiresAt }

Components
- SecurityOverview (risk posture + signals)
- VaultHealthCard
- KeyRotationPanel
- SlashingRiskCard
- AttackSurfaceList
- ComplianceReportsPanel
