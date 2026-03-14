/**
 * infra-api.ts — Client-side helper for the infrastructure status endpoint.
 */

export interface ContainerEntry {
  id: string;
  name: string;
  status: string;
  health: 'healthy' | 'unhealthy' | 'unknown';
}

export interface InfraStatus {
  containers: ContainerEntry[];
  vmCount: number;
  region: string;
  uptime: string;
}

export async function fetchInfraStatus(): Promise<InfraStatus> {
  const res = await fetch('/api/command-center/infra', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<InfraStatus>;
}
