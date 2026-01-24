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
    return process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  }
  return resolveHostUrl(process.env.NEXT_PUBLIC_API_URL, 4000, 'http://localhost:4000');
};

export const resolveRpcBase = (envUrl: string | undefined, port: number, fallback: string) =>
  resolveHostUrl(envUrl, port, fallback);

export const resolveComplianceBase = () =>
  resolveServiceUrl(
    process.env.COMPLIANCE_URL,
    process.env.NEXT_PUBLIC_COMPLIANCE_URL,
    8090,
    'http://localhost:8090',
    'http://ghost-compliance:8090'
  );

export const resolveGasEngineBase = () =>
  resolveServiceUrl(
    process.env.AI_CORE_URL || process.env.GAS_ENGINE_URL,
    process.env.NEXT_PUBLIC_AI_CORE_URL || process.env.NEXT_PUBLIC_GAS_ENGINE_URL,
    3210,
    'http://localhost:3210',
    'http://ghost-gas-engine:3210'
  );

export const resolvePilBase = () =>
  resolveServiceUrl(process.env.PIL_URL, process.env.NEXT_PUBLIC_PIL_URL, 3220, 'http://localhost:3220', 'http://ghost-pil:3220');

export const resolvePrometheusBase = () =>
  resolveServiceUrl(process.env.PROMETHEUS_URL, process.env.NEXT_PUBLIC_PROMETHEUS_URL, 9090, 'http://localhost:9090');

export const resolveDevopsBase = () =>
  resolveServiceUrl(process.env.DEVOPS_URL, process.env.NEXT_PUBLIC_DEVOPS_URL, 7623, 'http://localhost:7623');

export const resolveRpcEndpoints = () => ({
  l1: resolveRpcBase(process.env.L1_RPC || process.env.NEXT_PUBLIC_L1_RPC, 18545, 'http://localhost:18545'),
  l2: resolveRpcBase(process.env.L2_RPC || process.env.NEXT_PUBLIC_L2_RPC, 18547, 'http://localhost:18547'),
  l3: resolveRpcBase(process.env.L3_RPC || process.env.NEXT_PUBLIC_L3_RPC, 39545, 'http://localhost:39545')
});
