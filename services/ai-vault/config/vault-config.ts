/**
 * GhostStack AI Vault — Configuration Loader
 * Central security authority for the GhostChain ecosystem.
 * Chains: L1 (14000101), L2 (901), L3 (903). Gas token: GST.
 */

export interface RotationPolicy {
  name: string;
  path: string;
  intervalMs: number;
  keys?: string[];
  encoding?: 'hex' | 'base64';
  keyLength?: number;
  mount?: string;
  kvVersion?: number;
}

export interface VaultConfig {
  // Server
  port: number;
  host: string;
  nodeEnv: string;

  // HashiCorp Vault upstream (optional backend)
  vaultAddr: string;
  vaultToken: string;
  vaultNamespace: string;
  vaultRoleId: string;
  vaultSecretId: string;

  // Native encryption
  masterKeyPath: string;
  encryptionAlgorithm: 'aes-256-gcm' | 'chacha20-poly1305';
  argon2Iterations: number;
  argon2MemoryKb: number;
  argon2Parallelism: number;

  // Database
  dbPath: string;
  auditDbPath: string;

  // JWT / Auth
  jwtSecret: string;
  jwtExpirySeconds: number;
  mtlsEnabled: boolean;
  mtlsCaCertPath: string;

  // Rate limiting
  rateLimitWindowMs: number;
  rateLimitMax: number;
  burstLimit: number;
  blockMs: number;

  // Rotation
  rotateIntervalMs: number;

  // AI capabilities
  anomalyThreshold: number;
  threatPredictorEnabled: boolean;
  behaviorModelEnabled: boolean;
  selfHealingEnabled: boolean;
  ghostbrainUrl: string;
  ghostbrainApiKey: string;

  // GhostChain (L1/L2/L3 only — no external chains)
  ghostchainL1ChainId: number;
  ghostl2ChainId: number;
  ghostl3ChainId: number;
  ghostchainL1Rpc: string;
  ghostl2Rpc: string;
  ghostl3Rpc: string;

  // Integrations
  dockerSocketPath: string;
  libvirtUri: string;
  githubToken: string;

  // Snapshot / backup
  snapshotEnabled: boolean;
  snapshotIntervalMs: number;
  snapshotDir: string;

  // Audit
  auditGhostchainMirror: boolean;
  auditRetentionDays: number;

  // Policy enforcement
  executeActions: boolean;
  policyPath: string;
  policyWrite: boolean;
  defaultDecision: 'allow' | 'deny';

  // Allowed origins for CORS
  allowedOrigins: string[];
}

function e(key: string, def = ''): string {
  return process.env[key] ?? def;
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

export function loadVaultConfig(): VaultConfig {
  return {
    port: ei('PORT', 7710),
    host: e('HOST', '0.0.0.0'),
    nodeEnv: e('NODE_ENV', 'development'),

    vaultAddr: e('VAULT_ADDR', 'http://localhost:8200'),
    vaultToken: e('VAULT_TOKEN'),
    vaultNamespace: e('VAULT_NAMESPACE'),
    vaultRoleId: e('VAULT_ROLE_ID'),
    vaultSecretId: e('VAULT_SECRET_ID'),

    masterKeyPath: e('VAULT_MASTER_KEY_PATH', '/run/secrets/vault-master-key'),
    encryptionAlgorithm: (e('VAULT_ENCRYPTION_ALGO', 'aes-256-gcm') as 'aes-256-gcm' | 'chacha20-poly1305'),
    argon2Iterations: ei('ARGON2_ITERATIONS', 3),
    argon2MemoryKb: ei('ARGON2_MEMORY_KB', 65536),
    argon2Parallelism: ei('ARGON2_PARALLELISM', 4),

    dbPath: e('VAULT_DB_PATH', '/var/lib/ai-vault/vault.db'),
    auditDbPath: e('VAULT_AUDIT_DB_PATH', '/var/lib/ai-vault/audit.db'),

    jwtSecret: e('JWT_SECRET'),
    jwtExpirySeconds: ei('JWT_EXPIRY_SECONDS', 3600),
    mtlsEnabled: eb('MTLS_ENABLED', false),
    mtlsCaCertPath: e('MTLS_CA_CERT_PATH', '/run/secrets/vault-ca.pem'),

    rateLimitWindowMs: ei('RATE_LIMIT_WINDOW_MS', 60_000),
    rateLimitMax: ei('RATE_LIMIT_MAX', 1000),
    burstLimit: ei('AI_VAULT_BURST_LIMIT', 40),
    blockMs: ei('AI_VAULT_BLOCK_MS', 300_000),

    rotateIntervalMs: ei('AI_VAULT_ROTATE_INTERVAL_MS', 900_000),

    anomalyThreshold: parseFloat(e('AI_ANOMALY_THRESHOLD', '0.85')),
    threatPredictorEnabled: eb('AI_THREAT_PREDICTOR', true),
    behaviorModelEnabled: eb('AI_BEHAVIOR_MODEL', true),
    selfHealingEnabled: eb('AI_SELF_HEALING', true),
    ghostbrainUrl: e('GHOSTBRAIN_URL', 'http://localhost:7900'),
    ghostbrainApiKey: e('GHOSTBRAIN_API_KEY'),

    // Chain IDs are architecture constants — never change
    ghostchainL1ChainId: 14000101,
    ghostl2ChainId: 901,
    ghostl3ChainId: 903,
    ghostchainL1Rpc: e('GHOSTCHAIN_L1_RPC', 'http://localhost:18545'),
    ghostl2Rpc: e('GHOSTL2_RPC', 'http://localhost:29545'),
    ghostl3Rpc: e('GHOSTL3_RPC', 'http://localhost:39545'),

    dockerSocketPath: e('DOCKER_SOCKET', '/var/run/docker.sock'),
    libvirtUri: e('LIBVIRT_URI', 'qemu:///system'),
    githubToken: e('GITHUB_TOKEN'),

    snapshotEnabled: eb('VAULT_SNAPSHOT_ENABLED', true),
    snapshotIntervalMs: ei('VAULT_SNAPSHOT_INTERVAL_MS', 3_600_000),
    snapshotDir: e('VAULT_SNAPSHOT_DIR', '/var/lib/ai-vault/snapshots'),

    auditGhostchainMirror: eb('AUDIT_GHOSTCHAIN_MIRROR', false),
    auditRetentionDays: ei('AUDIT_RETENTION_DAYS', 90),

    executeActions: eb('AI_VAULT_EXECUTE', false),
    policyPath: e('AI_VAULT_POLICY_PATH', './config/policies.yaml'),
    policyWrite: eb('AI_VAULT_POLICY_WRITE', false),
    defaultDecision: (e('AI_VAULT_DEFAULT_DECISION', 'deny') as 'allow' | 'deny'),

    allowedOrigins: e('ALLOWED_ORIGINS', '').split(',').map(s => s.trim()).filter(Boolean),
  };
}

export const config: VaultConfig = loadVaultConfig();
