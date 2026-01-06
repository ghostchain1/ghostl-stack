type RpcRequest = {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown[];
};

export async function rpcCall<T = unknown>(rpcUrl: string, method: string, params: unknown[] = []): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const payload: RpcRequest = { jsonrpc: '2.0', id: Date.now(), method, params };
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: { result?: T; error?: { message?: string } } = await res.json();
    if (body.error) throw new Error(body.error.message || 'RPC error');
    return body.result as T;
  } finally {
    clearTimeout(timeout);
  }
}
