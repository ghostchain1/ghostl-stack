export type RpcEndpointType = 'public' | 'private' | 'partner';
export type EndpointStatus = 'healthy' | 'degraded' | 'down';

export interface RpcEndpoint {
  id: string;
  chainId?: string;
  chainKey?: string;
  chainName?: string;
  layer?: string;
  chainType?: string;
  network?: string;
  url: string;
  type: RpcEndpointType;
  protocol?: 'http' | 'ws';
  auth?: 'none' | 'apiKey' | 'bearer' | 'basic';
  region?: string;
  priority?: number;
  features?: Record<string, boolean>;
  latencyMs?: number;
  peerCount?: number;
  syncing?: boolean;
  clientVersion?: string;
  wsError?: string;
  status: EndpointStatus;
  lastCheckedAt?: string;
}

export interface Webhook {
  id: string;
  eventTypes: string[];
  targetUrl: string;
  secretRef?: string;
  createdAt?: string;
}

export interface IntegrationPartner {
  name: string;
  type: 'exchange' | 'oracle' | 'indexer' | 'analytics' | 'kyc';
  status: 'connected' | 'pending' | 'error';
  url?: string;
}

export type IntegrationEnvironment = 'local' | 'dev' | 'staging' | 'prod';

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
    status: 'OK' | 'DEGRADED' | 'DOWN';
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
