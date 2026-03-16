import { GHOST_RPC_ENDPOINTS, GHOST_SERVICES } from "@ghostchain/config";

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const isLoopbackUrl = (value?: string) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

const hostFromWindow = () => {
  if (typeof window === 'undefined') return '';
  return window.location.hostname || '';
};

const resolveServiceUrl = (
  serverEnv: string | undefined,
  clientEnv: string | undefined,
  port: number,
  fallback: string,
  serverFallback?: string
) => {
  if (typeof window === 'undefined') {
    return serverEnv || clientEnv || serverFallback || fallback;
  }
  return resolveHostUrl(clientEnv || serverEnv, port, fallback);
};

export const resolveHostUrl = (envUrl: string | undefined, port: number, fallback: string) => {
  if (typeof window !== 'undefined') {
    const host = hostFromWindow();
    if (host && (!envUrl || isLoopbackUrl(envUrl))) {
      return `http://${host}:${port}`;
    }
  }
  return envUrl || fallback;
};

export const resolveApiBase = () => {
  if (typeof window === 'undefined') {
    return process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || GHOST_SERVICES.api.localUrl;
  }
  return resolveHostUrl(process.env.NEXT_PUBLIC_API_URL, 4000, GHOST_SERVICES.api.localUrl);
};

export const resolveRpcBase = (envUrl: string | undefined, port: number, fallback: string) =>
  resolveHostUrl(envUrl, port, fallback);

export const resolveComplianceBase = () =>
  resolveServiceUrl(
    process.env.COMPLIANCE_URL,
    process.env.NEXT_PUBLIC_COMPLIANCE_URL,
    8090,
    GHOST_SERVICES.compliance.localUrl,
    GHOST_SERVICES.compliance.internalUrl
  );

export const resolveGasEngineBase = () =>
  resolveServiceUrl(
    process.env.AI_CORE_URL || process.env.GAS_ENGINE_URL,
    process.env.NEXT_PUBLIC_AI_CORE_URL || process.env.NEXT_PUBLIC_GAS_ENGINE_URL,
    3210,
    GHOST_SERVICES.aiCore.localUrl,
    GHOST_SERVICES.aiCore.internalUrl
  );

export const resolvePilBase = () =>
  resolveServiceUrl(process.env.PIL_URL, process.env.NEXT_PUBLIC_PIL_URL, 3220, GHOST_SERVICES.pil.localUrl, GHOST_SERVICES.pil.internalUrl);

export const resolvePrometheusBase = () =>
  resolveServiceUrl(process.env.PROMETHEUS_URL, process.env.NEXT_PUBLIC_PROMETHEUS_URL, 9090, GHOST_SERVICES.prometheus.localUrl);

export const resolveDevopsBase = () =>
  resolveServiceUrl(process.env.DEVOPS_URL, process.env.NEXT_PUBLIC_DEVOPS_URL, 7623, GHOST_SERVICES.devops.localUrl);

export const resolveAiAttestorBase = () =>
  resolveServiceUrl(
    process.env.AI_ATTESTOR_URL,
    process.env.NEXT_PUBLIC_AI_ATTESTOR_URL,
    3310,
    'http://localhost:3310',
    'http://ghost-ai-attestor:3310'
  );

export const resolveRpcEndpoints = () => ({
  l1: resolveRpcBase(process.env.L1_RPC || process.env.NEXT_PUBLIC_L1_RPC, GHOST_RPC_ENDPOINTS.l1.port, GHOST_RPC_ENDPOINTS.l1.localUrl),
  l2: resolveRpcBase(process.env.L2_RPC || process.env.NEXT_PUBLIC_L2_RPC, GHOST_RPC_ENDPOINTS.l2.port, GHOST_RPC_ENDPOINTS.l2.localUrl),
  l3: resolveRpcBase(process.env.L3_RPC || process.env.NEXT_PUBLIC_L3_RPC, GHOST_RPC_ENDPOINTS.l3.port, GHOST_RPC_ENDPOINTS.l3.localUrl)
});
