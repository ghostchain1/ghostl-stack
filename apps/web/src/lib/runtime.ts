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
