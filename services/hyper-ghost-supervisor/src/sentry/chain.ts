import { setTimeout as sleep } from 'node:timers/promises';

type RpcProbeResult = {
  ok: boolean;
  latency_ms: number;
  reason?: string;
  detail?: unknown;
};

const jsonrpc = async (url: string, method: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`http_${res.status}`);
    const parsed = JSON.parse(text);
    if (parsed.error) throw new Error(`rpc_${parsed.error.code || 'error'}`);
    return parsed.result;
  } finally {
    clearTimeout(timeout);
  }
};

export async function probeRpc(url: string, timeoutMs: number): Promise<RpcProbeResult> {
  const start = Date.now();
  try {
    const [chainId, netVersion, blockNumber] = await Promise.all([
      jsonrpc(url, 'gst_chainId', timeoutMs),
      jsonrpc(url, 'net_version', timeoutMs),
      jsonrpc(url, 'gst_blockNumber', timeoutMs)
    ]);
    const latency_ms = Date.now() - start;
    return { ok: true, latency_ms, detail: { chainId, netVersion, blockNumber } };
  } catch (e) {
    const latency_ms = Date.now() - start;
    return { ok: false, latency_ms, reason: e instanceof Error ? e.message : 'rpc_probe_failed' };
  }
}

export async function probeHttp(url: string, timeoutMs: number): Promise<RpcProbeResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latency_ms = Date.now() - start;
    if (!res.ok) return { ok: false, latency_ms, reason: `http_${res.status}` };
    return { ok: true, latency_ms };
  } catch (e) {
    const latency_ms = Date.now() - start;
    return { ok: false, latency_ms, reason: e instanceof Error ? e.message : 'http_probe_failed' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function backoff(attempt: number) {
  const ms = Math.min(2000, 200 * Math.max(1, attempt));
  await sleep(ms);
}
