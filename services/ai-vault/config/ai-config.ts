/**
 * GhostStack AI Vault — AI Model Configuration
 * Tunable parameters for anomaly detection, behavioral modeling,
 * threat prediction, and autonomous response.
 */

export interface AiConfig {
  /** Anomaly detection sensitivity (0–1). Higher = more sensitive. */
  anomalySensitivity: number;
  /** Minimum data points before anomaly model activates. */
  anomalyWarmupCount: number;
  /** Rolling window of access events retained for analysis (per actor). */
  behaviorWindowSize: number;
  /** Time window for rate analysis in ms. */
  behaviorWindowMs: number;

  /** Risk score bounds */
  riskThresholdLow: number;     // 0–0.3: normal
  riskThresholdMedium: number;  // 0.3–0.6: elevated
  riskThresholdHigh: number;    // 0.6–0.85: high
  riskThresholdCritical: number; // 0.85–1.0: critical → auto-response

  /** Number of standard deviations from mean to flag as anomalous. */
  zScoreThreshold: number;

  /** Entropy thresholds for request pattern analysis. */
  entropyNormalMax: number;
  entropySuspectedMin: number;

  /** Automatic rotation triggers */
  rotateOnHighRisk: boolean;
  rotateOnCriticalRisk: boolean;
  rotationRiskThreshold: number;

  /** Self-healing response delays (ms) */
  quarantineDelayMs: number;
  autoRevokeDelayMs: number;
  alertCooldownMs: number;

  /** GhostBrain integration */
  ghostbrainEnabled: boolean;
  ghostbrainTimeoutMs: number;
  ghostbrainSignalPath: string;

  /** Compliance reporting */
  complianceCheckIntervalMs: number;
  complianceFrameworks: string[];

  /** Rotation policy defaults (millisecond intervals) */
  rotationDefaults: {
    jwtSecret: number;
    apiToken: number;
    dbPassword: number;
    validatorHotKey: number;
    dnsKey: number;
    sshKey: number;
    sslCert: number;
    bridgeKey: number;
    treasuryKey: number;
  };
}

function ef(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}
function ei(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function eb(key: string, def = false): boolean {
  const v = process.env[key];
  if (!v) return def;
  return v === '1' || v.toLowerCase() === 'true';
}

export function loadAiConfig(): AiConfig {
  return {
    anomalySensitivity: ef('AI_ANOMALY_SENSITIVITY', 0.85),
    anomalyWarmupCount: ei('AI_ANOMALY_WARMUP', 50),
    behaviorWindowSize: ei('AI_BEHAVIOR_WINDOW_SIZE', 500),
    behaviorWindowMs: ei('AI_BEHAVIOR_WINDOW_MS', 3_600_000), // 1 hour

    riskThresholdLow: 0.3,
    riskThresholdMedium: 0.6,
    riskThresholdHigh: 0.85,
    riskThresholdCritical: 0.95,

    zScoreThreshold: ef('AI_ZSCORE_THRESHOLD', 3.0),
    entropyNormalMax: ef('AI_ENTROPY_NORMAL_MAX', 0.7),
    entropySuspectedMin: ef('AI_ENTROPY_SUSPECTED_MIN', 0.9),

    rotateOnHighRisk: eb('AI_ROTATE_ON_HIGH_RISK', true),
    rotateOnCriticalRisk: eb('AI_ROTATE_ON_CRITICAL_RISK', true),
    rotationRiskThreshold: ef('AI_ROTATION_RISK_THRESHOLD', 0.75),

    quarantineDelayMs: ei('AI_QUARANTINE_DELAY_MS', 0),
    autoRevokeDelayMs: ei('AI_AUTO_REVOKE_DELAY_MS', 5_000),
    alertCooldownMs: ei('AI_ALERT_COOLDOWN_MS', 60_000),

    ghostbrainEnabled: eb('AI_GHOSTBRAIN_ENABLED', true),
    ghostbrainTimeoutMs: ei('AI_GHOSTBRAIN_TIMEOUT_MS', 5_000),
    ghostbrainSignalPath: process.env['AI_GHOSTBRAIN_SIGNAL_PATH'] ?? '/api/v1/signal',

    complianceCheckIntervalMs: ei('AI_COMPLIANCE_INTERVAL_MS', 86_400_000), // 24h
    complianceFrameworks: (process.env['AI_COMPLIANCE_FRAMEWORKS'] ?? 'SOC2,ISO27001').split(',').map(s => s.trim()),

    rotationDefaults: {
      jwtSecret:     ei('ROTATE_JWT_SECRET_MS',      86_400_000),      // 24h
      apiToken:      ei('ROTATE_API_TOKEN_MS',        604_800_000),     // 7d
      dbPassword:    ei('ROTATE_DB_PASSWORD_MS',      604_800_000),     // 7d
      validatorHotKey: ei('ROTATE_VALIDATOR_KEY_MS',  43_200_000),     // 12h
      dnsKey:        ei('ROTATE_DNS_KEY_MS',          2_592_000_000),   // 30d
      sshKey:        ei('ROTATE_SSH_KEY_MS',          2_592_000_000),   // 30d
      sslCert:       ei('ROTATE_SSL_CERT_MS',         7_776_000_000),   // 90d
      bridgeKey:     ei('ROTATE_BRIDGE_KEY_MS',       86_400_000),      // 24h
      treasuryKey:   ei('ROTATE_TREASURY_KEY_MS',     604_800_000),     // 7d
    },
  };
}

export const aiConfig: AiConfig = loadAiConfig();
