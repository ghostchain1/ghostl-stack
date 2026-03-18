// config.ts — environment-driven configuration for autonomous-vault-hypervisor

export const CFG = {
  port: Number(process.env.PORT ?? 7720),
  serviceName: 'autonomous-vault-hypervisor',

  natsUrl: process.env.NATS_URL ?? 'nats://nats:4222',
  ghostbrainUrl: process.env.GHOSTBRAIN_URL ?? 'http://ghostbrain-core:7900',
  ghostbrainEnabled:
    (process.env.GHOSTBRAIN_ENABLED ?? '1') !== '0' &&
    process.env.GHOSTBRAIN_ENABLED !== 'false',

  vaultAddr: process.env.VAULT_ADDR ?? 'http://ai-vault:7710',
  vaultToken: process.env.VAULT_TOKEN ?? '',
  vaultRoleId: process.env.VAULT_ROLE_ID ?? '',
  vaultSecretId: process.env.VAULT_SECRET_ID ?? '',
  vaultNamespace: process.env.VAULT_NAMESPACE ?? '',
  aiVaultAddr: process.env.AI_VAULT_ADDR ?? 'http://ai-vault:7710',

  rotateIntervalMs: Number(process.env.ROTATE_INTERVAL_MS ?? 900_000),
  rotateEnabled: (process.env.ROTATE_ENABLED ?? '1') !== '0',

  hypervisorHost: process.env.HYPERVISOR_HOST ?? '',
  hypervisorUser: process.env.HYPERVISOR_USER ?? 'ghost',
  hypervisorPort: Number(process.env.HYPERVISOR_SSH_PORT ?? 22),
  hypervisorKey: process.env.HYPERVISOR_SSH_KEY_PATH ?? '',
  sshEnabled: (process.env.SSH_ENABLED ?? '1') !== '0',

  dockerSocket: process.env.DOCKER_SOCKET ?? '/var/run/docker.sock',
  dockerEnabled: (process.env.DOCKER_ENABLED ?? '1') !== '0',
  dockerHost: process.env.DOCKER_HOST ?? '',

  reconcileIntervalMs: Number(process.env.RECONCILE_INTERVAL_MS ?? 60_000),
  remediateEnabled: (process.env.REMEDIATE_ENABLED ?? '1') !== '0',
  maxRemediationsPerRun: Number(process.env.MAX_REMEDIATIONS_PER_RUN ?? 3),

  policyPath: process.env.POLICY_PATH ?? '/var/lib/avh/policy.json',
  executeActions: (process.env.EXECUTE_ACTIONS ?? '1') !== '0',
  emergencyLock: (process.env.EMERGENCY_LOCK ?? '0') === '1',

  hmacSecret: process.env.HMAC_SECRET ?? 'dev-autonomous-vault-hypervisor-secret',
  requireSignature: (process.env.REQUIRE_SIGNATURE ?? '0') !== '0',

  vmLayerMap: (() => {
    try {
      return JSON.parse(process.env.VM_LAYER_MAP ?? '{}') as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  })(),

  maxContainerRestarts: Number(process.env.MAX_CONTAINER_RESTARTS ?? 5),
  restartCooldownMs: Number(process.env.RESTART_COOLDOWN_MS ?? 120_000),

  redactFields: [
    'VAULT_TOKEN',
    'VAULT_SECRET_ID',
    'HMAC_SECRET',
    'HYPERVISOR_SSH_KEY_PATH',
    'password',
    'token',
    'secret',
  ],
} as const;
