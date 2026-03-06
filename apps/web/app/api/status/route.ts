import { NextResponse } from 'next/server';
import {
  resolveApiBase,
  resolveComplianceBase,
  resolveDevopsBase,
  resolveGasEngineBase,
  resolvePilBase,
  resolvePrometheusBase,
  resolveRpcEndpoints
} from '../../../src/lib/runtime';

type ServiceStatus = {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  status?: string;
  error?: string;
  httpStatus?: number;
  latencyMs?: number;
};

type ChainStatus = {
  key: 'l1' | 'l2' | 'l3';
  rpc: string;
  ok: boolean;
  chainId?: string;
  blockNumber?: string;
  error?: string;
  latencyMs?: number;
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const started = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    return { res, latencyMs: Date.now() - started };
  } catch (error) {
    return { error, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
};

const stringifyError = (error: unknown) => (error instanceof Error ? error.message : 'request_failed');

const isMethodNotFound = (error?: string) => {
  const msg = String(error || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return msg.includes('method not found') || msg.includes('does not exist') || msg.includes('not available');
};

const checkHealth = async (id: string, name: string, baseUrl: string, path = '/health'): Promise<ServiceStatus> => {
  const url = `${baseUrl}${path}`;
  const { res, error, latencyMs } = await fetchWithTimeout(url, { method: 'GET' }, 2500);
  if (!res) {
    return { id, name, url, ok: false, error: stringifyError(error), latencyMs };
  }
  const payload = await res.json().catch(() => ({}));
  const ok = res.ok && payload?.ok !== false;
  const status = payload?.status || (ok ? 'healthy' : 'unhealthy');
  return { id, name, url, ok, status, httpStatus: res.status, latencyMs };
};

const rpcCall = async (url: string, method: string) => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: method, method, params: [] });
  const { res, error, latencyMs } = await fetchWithTimeout(
    url,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body },
    3000
  );
  if (!res) {
    return { ok: false, error: stringifyError(error), latencyMs };
  }
  const payload = await res.json().catch(() => ({}));
  if (payload?.error) {
    return { ok: false, error: payload.error?.message || 'rpc_error', latencyMs };
  }
  return { ok: res.ok, result: payload?.result, latencyMs };
};

const rpcBlockNumber = async (url: string) => {
  const gst = await rpcCall(url, 'gst_blockNumber');
  if (gst.ok) return gst;
  if (!isMethodNotFound(gst.error)) return gst;
  return await rpcCall(url, 'ghost_blockNumber');
};

const checkChain = async (key: ChainStatus['key'], rpc: string): Promise<ChainStatus> => {
  if (!rpc) {
    return { key, rpc, ok: false, error: 'rpc_url_missing' };
  }
  const [chainId, blockNumber] = await Promise.all([rpcCall(rpc, 'ghost_chainId'), rpcBlockNumber(rpc)]);
  const ok = chainId.ok && blockNumber.ok;
  const latencyMs = Math.max(chainId.latencyMs || 0, blockNumber.latencyMs || 0);
  return {
    key,
    rpc,
    ok,
    chainId: chainId.result,
    blockNumber: blockNumber.result,
    error: ok ? undefined : chainId.error || blockNumber.error || 'rpc_unavailable',
    latencyMs
  };
};

export async function GET() {
  const rpc = resolveRpcEndpoints();
  const apiBase = resolveApiBase();

  const [api, compliance, gasEngine, pil, prometheus, devops] = await Promise.all([
    checkHealth('api', 'Ghost API', apiBase, '/health'),
    checkHealth('compliance', 'Compliance API', resolveComplianceBase(), '/health'),
    checkHealth('gas-engine', 'Gas Engine', resolveGasEngineBase(), '/health'),
    checkHealth('pil', 'Protocol Intelligence', resolvePilBase(), '/health'),
    checkHealth('prometheus', 'Prometheus', resolvePrometheusBase(), '/-/healthy'),
    checkHealth('devops', 'DevOps', resolveDevopsBase(), '/health')
  ]);

  const chains = await Promise.all([
    checkChain('l1', rpc.l1),
    checkChain('l2', rpc.l2),
    checkChain('l3', rpc.l3)
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    services: [api, compliance, gasEngine, pil, prometheus, devops],
    chains
  });
}
