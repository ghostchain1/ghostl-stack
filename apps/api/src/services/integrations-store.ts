import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../config/env';

export type IntegrationEnvironment = 'local' | 'dev' | 'staging' | 'prod';
export type IntegrationHealthStatus = 'OK' | 'DEGRADED' | 'DOWN';

export type IntegrationDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  configFields: Array<{
    key: string;
    label: string;
    type: 'string' | 'url' | 'number' | 'boolean' | 'secret';
    required?: boolean;
  }>;
};

export type IntegrationInstance = {
  id: string;
  definitionId: string;
  enabled: boolean;
  environment: IntegrationEnvironment;
  configRef: { kind: 'vault' | 'db'; ref: string };
  health: {
    status: IntegrationHealthStatus;
    lastCheckedAt: string | null;
    latencyMs: number | null;
    lastError: string | null;
  };
  policy: {
    timeoutMs: number;
    retries: number;
    backoffMs: number;
    rateLimitPerMin: number;
    circuitBreaker: { enabled: boolean; failOpen: boolean };
  };
  createdAt: string;
  updatedAt: string;
};

export type IntegrationTestResult = {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  latencyMs: number | null;
};

type ConfigEnvelope = {
  cipherText: string;
  iv: string;
  tag: string;
  updatedAt: string;
};

type StoreShape = {
  instances: IntegrationInstance[];
  configs: Record<string, ConfigEnvelope>;
};

const defaultPolicy = {
  timeoutMs: 3500,
  retries: 2,
  backoffMs: 500,
  rateLimitPerMin: 120,
  circuitBreaker: { enabled: true, failOpen: false }
};

const definitions: IntegrationDefinition[] = [
  {
    id: 'rpc-registry',
    name: 'RPC Registry',
    description: 'GhostChain RPC registry discovery endpoint.',
    category: 'core',
    configFields: [
      { key: 'baseUrl', label: 'Base URL', type: 'url', required: true },
      { key: 'apiKey', label: 'API Key', type: 'secret' }
    ]
  },
  {
    id: 'rpc-endpoint',
    name: 'RPC Endpoint',
    description: 'Direct RPC endpoint configuration for chain access.',
    category: 'network',
    configFields: [
      { key: 'baseUrl', label: 'RPC URL', type: 'url', required: true },
      { key: 'chainId', label: 'Chain ID', type: 'number' },
      { key: 'protocol', label: 'Protocol', type: 'string' },
      { key: 'apiKey', label: 'API Key', type: 'secret' }
    ]
  },
  {
    id: 'kyc-provider',
    name: 'KYC Provider',
    description: 'External KYC/AML verification gateway.',
    category: 'compliance',
    configFields: [
      { key: 'baseUrl', label: 'Base URL', type: 'url', required: true },
      { key: 'apiKey', label: 'API Key', type: 'secret' },
      { key: 'healthPath', label: 'Health Path', type: 'string' }
    ]
  },
  {
    id: 'contract-registry',
    name: 'Contract Registry',
    description: 'Smart contract registry service.',
    category: 'ops',
    configFields: [
      { key: 'baseUrl', label: 'Base URL', type: 'url', required: true },
      { key: 'apiKey', label: 'API Key', type: 'secret' }
    ]
  }
];

const isEnvironment = (value: unknown): value is IntegrationEnvironment =>
  value === 'local' || value === 'dev' || value === 'staging' || value === 'prod';

const resolveKey = () => {
  const raw = env.INTEGRATIONS_MASTER_KEY || env.GHOSTWALLET_MASTER_KEY;
  const buf = Buffer.from(raw, 'hex');
  if (buf.length === 32) return buf;
  return createHash('sha256').update(raw).digest();
};

const encryptConfig = (payload: Record<string, unknown>): ConfigEnvelope => {
  const iv = randomBytes(12);
  const key = resolveKey();
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const enc = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([enc.update(data), enc.final()]);
  const tag = enc.getAuthTag();
  return {
    cipherText: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    updatedAt: new Date().toISOString()
  };
};

const decryptConfig = (envelope: ConfigEnvelope): Record<string, unknown> => {
  const key = resolveKey();
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const encrypted = Buffer.from(envelope.cipherText, 'base64');
  const dec = createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(tag);
  const decrypted = Buffer.concat([dec.update(encrypted), dec.final()]);
  return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
};

const defaultStorePath = () => path.join(process.cwd(), 'data', 'integrations.json');

const loadStore = async (storePath: string): Promise<StoreShape> => {
  try {
    const raw = await fs.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw) as StoreShape;
    return { instances: parsed.instances || [], configs: parsed.configs || {} };
  } catch {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    const initial: StoreShape = { instances: [], configs: {} };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }
};

const saveStore = async (storePath: string, store: StoreShape) => {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2));
};

const vaultConfigured = () => Boolean(env.VAULT_ADDR && env.VAULT_TOKEN);

const vaultWrite = async (ref: string, payload: Record<string, unknown>) => {
  const resp = await fetch(`${env.VAULT_ADDR}/v1/${ref}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vault-token': env.VAULT_TOKEN || '' },
    body: JSON.stringify({ data: payload })
  });
  if (!resp.ok) throw new Error('vault_write_failed');
};

const vaultRead = async (ref: string) => {
  const resp = await fetch(`${env.VAULT_ADDR}/v1/${ref}`, {
    headers: { 'x-vault-token': env.VAULT_TOKEN || '' }
  });
  if (!resp.ok) throw new Error('vault_read_failed');
  const body = (await resp.json()) as { data?: { data?: Record<string, unknown> } };
  return body.data?.data || {};
};

const requestWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const rpcJson = async (url: string, method: string, timeoutMs: number) => {
  const res = await requestWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] })
    },
    timeoutMs
  );
  if (!res.ok) throw new Error(`http_${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || 'rpc_error');
  return body.result;
};

const buildChecks = (entries: Array<{ name: string; ok: boolean; detail: string }>) => entries;

export const createIntegrationsStore = async () => {
  const storePath = env.INTEGRATIONS_STORE_PATH || defaultStorePath();
  const store = await loadStore(storePath);

  const listDefinitions = () => definitions;

  const listInstances = () => store.instances;

  const getInstance = (id: string) => store.instances.find((instance) => instance.id === id) || null;

  const resolveConfig = async (instance: IntegrationInstance) => {
    if (instance.configRef.kind === 'vault') {
      return await vaultRead(instance.configRef.ref);
    }
    const envelope = store.configs[instance.configRef.ref];
    if (!envelope) throw new Error('config_not_found');
    return decryptConfig(envelope);
  };

  const setConfig = async (instanceId: string, config: Record<string, unknown>) => {
    if (vaultConfigured()) {
      const ref = `secret/data/ghostl-integrations/${instanceId}`;
      await vaultWrite(ref, config);
      return { kind: 'vault' as const, ref };
    }
    const ref = `db:${instanceId}`;
    store.configs[ref] = encryptConfig(config);
    await saveStore(storePath, store);
    return { kind: 'db' as const, ref };
  };

  const validateConfig = (definitionId: string, config: Record<string, unknown>) => {
    const definition = definitions.find((d) => d.id === definitionId);
    if (!definition) throw new Error('definition_not_found');
    definition.configFields.forEach((field) => {
      if (!field.required) return;
      if (config[field.key] === undefined || config[field.key] === null || config[field.key] === '') {
        throw new Error(`missing_${field.key}`);
      }
    });
  };

  const createInstance = async (input: {
    definitionId: string;
    environment: IntegrationEnvironment;
    enabled: boolean;
    config: Record<string, unknown>;
    policy?: Partial<IntegrationInstance['policy']>;
  }) => {
    if (!isEnvironment(input.environment)) throw new Error('invalid_environment');
    validateConfig(input.definitionId, input.config);
    const id = randomUUID();
    const configRef = await setConfig(id, input.config);
    const now = new Date().toISOString();
    const instance: IntegrationInstance = {
      id,
      definitionId: input.definitionId,
      enabled: input.enabled,
      environment: input.environment,
      configRef,
      policy: { ...defaultPolicy, ...input.policy, circuitBreaker: { ...defaultPolicy.circuitBreaker, ...(input.policy?.circuitBreaker || {}) } },
      health: { status: 'DOWN', lastCheckedAt: null, latencyMs: null, lastError: null },
      createdAt: now,
      updatedAt: now
    };
    store.instances.push(instance);
    await saveStore(storePath, store);
    return instance;
  };

  const updateInstance = async (
    id: string,
    input: Partial<Pick<IntegrationInstance, 'enabled' | 'environment' | 'policy'>> & { config?: Record<string, unknown> }
  ) => {
    const instance = store.instances.find((item) => item.id === id);
    if (!instance) throw new Error('instance_not_found');
    if (input.environment) {
      if (!isEnvironment(input.environment)) throw new Error('invalid_environment');
      instance.environment = input.environment;
    }
    if (typeof input.enabled === 'boolean') instance.enabled = input.enabled;
    if (input.policy) {
      instance.policy = {
        ...instance.policy,
        ...input.policy,
        circuitBreaker: {
          ...instance.policy.circuitBreaker,
          ...(input.policy.circuitBreaker || {})
        }
      };
    }
    if (input.config) {
      validateConfig(instance.definitionId, input.config);
      instance.configRef = await setConfig(instance.id, input.config);
    }
    instance.updatedAt = new Date().toISOString();
    await saveStore(storePath, store);
    return instance;
  };

  const setHealth = async (instance: IntegrationInstance, health: IntegrationInstance['health']) => {
    instance.health = health;
    instance.updatedAt = new Date().toISOString();
    await saveStore(storePath, store);
  };

  const testInstance = async (id: string): Promise<IntegrationTestResult> => {
    const instance = store.instances.find((item) => item.id === id);
    if (!instance) throw new Error('instance_not_found');
    const config = await resolveConfig(instance);
    const baseUrl = String(config.baseUrl || '');
    const apiKey = config.apiKey ? String(config.apiKey) : '';
    const started = Date.now();
    const timeoutMs = instance.policy.timeoutMs;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
    let ok = true;
    try {
      if (!baseUrl) throw new Error('missing_baseUrl');
      if (instance.definitionId === 'rpc-registry') {
        const res = await requestWithTimeout(baseUrl, { headers }, timeoutMs);
        if (!res.ok) throw new Error(`http_${res.status}`);
        const body = (await res.json().catch(() => ({}))) as { registry?: { name?: string }; chains?: unknown[] };
        const hasRegistry = Boolean(body.registry?.name);
        const hasChains = Array.isArray(body.chains) && body.chains.length > 0;
        checks.push(...buildChecks([
          { name: 'registry', ok: hasRegistry, detail: hasRegistry ? 'registry_present' : 'registry_missing' },
          { name: 'chains', ok: hasChains, detail: hasChains ? 'chains_present' : 'chains_missing' }
        ]));
        ok = checks.every((c) => c.ok);
      } else if (instance.definitionId === 'kyc-provider') {
        const healthPath = config.healthPath ? String(config.healthPath) : '/health';
        const url = baseUrl.replace(/\/$/, '') + healthPath;
        const res = await requestWithTimeout(url, { headers }, timeoutMs);
        checks.push({ name: 'connectivity', ok: res.ok, detail: res.ok ? 'ok' : `http_${res.status}` });
        ok = res.ok;
      } else if (instance.definitionId === 'contract-registry') {
        const url = baseUrl.replace(/\/$/, '') + '/contracts';
        const res = await requestWithTimeout(url, { headers }, timeoutMs);
        if (!res.ok) throw new Error(`http_${res.status}`);
        const body = (await res.json().catch(() => ({}))) as { contracts?: unknown[] };
        const hasContracts = Array.isArray(body.contracts);
        checks.push({ name: 'contracts', ok: hasContracts, detail: hasContracts ? 'contracts_ok' : 'contracts_missing' });
        ok = checks.every((c) => c.ok);
      } else if (instance.definitionId === 'rpc-endpoint') {
        const result = await rpcJson(baseUrl, 'eth_chainId', timeoutMs);
        const hasChainId = typeof result === 'string' && result.length > 0;
        checks.push({ name: 'chainId', ok: hasChainId, detail: hasChainId ? 'chainId_ok' : 'chainId_missing' });
        ok = checks.every((c) => c.ok);
      } else {
        const res = await requestWithTimeout(baseUrl, { headers }, timeoutMs);
        checks.push({ name: 'connectivity', ok: res.ok, detail: res.ok ? 'ok' : `http_${res.status}` });
        ok = res.ok;
      }
    } catch (err) {
      ok = false;
      checks.push({ name: 'connectivity', ok: false, detail: err instanceof Error ? err.message : 'failed' });
    }
    const latencyMs = Date.now() - started;
    const degraded = ok && latencyMs > timeoutMs;
    const healthStatus: IntegrationHealthStatus = ok ? (degraded ? 'DEGRADED' : 'OK') : 'DOWN';
    const lastError = ok ? null : checks.find((c) => !c.ok)?.detail || 'failed';
    await setHealth(instance, {
      status: healthStatus,
      lastCheckedAt: new Date().toISOString(),
      latencyMs,
      lastError
    });
    return { ok, checks, latencyMs };
  };

  return {
    listDefinitions,
    listInstances,
    getInstance,
    createInstance,
    updateInstance,
    testInstance
  };
};
