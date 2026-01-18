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
