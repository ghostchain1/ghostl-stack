export type RpcEndpointType = 'public' | 'private' | 'partner';
export type EndpointStatus = 'healthy' | 'degraded' | 'down';

export interface RpcEndpoint {
  id: string;
  url: string;
  type: RpcEndpointType;
  region?: string;
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
