const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function bridgeTransfer(params: {
  fromRpc: string;
  toRpc: string;
  token?: string;
  to: string;
  amount: string;
  privateKey: string;
}) {
  const res = await fetch(`${API_URL}/wallet/bridge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Bridge failed: ${res.status}`);
  }
  return res.json();
}

export async function getBalance(params: { rpc: string; address: string; token?: string }) {
  const query = new URLSearchParams({
    rpc: params.rpc,
    address: params.address,
    ...(params.token ? { token: params.token } : {})
  });
  const res = await fetch(`${API_URL}/wallet/token/balance?${query.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Balance failed: ${res.status}`);
  }
  return res.json() as Promise<{ address: string; balance: string; token?: string }>;
}

export async function sendFunds(params: {
  rpc: string;
  to: string;
  amount: string;
  privateKey: string;
  token?: string;
  gasPrice?: string;
  gasLimit?: string;
}) {
  const res = await fetch(`${API_URL}/wallet/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Send failed: ${res.status}`);
  }
  return res.json() as Promise<{ tx: string }>;
}

export async function swapTokens(params: {
  rpc: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  recipient: string;
  privateKey: string;
}) {
  const res = await fetch(`${API_URL}/wallet/swap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Swap failed: ${res.status}`);
  }
  return res.json() as Promise<{ tx: string; note?: string }>;
}

export async function getSwapQuote(params: { tokenIn: string; tokenOut: string; amount: string }) {
  const query = new URLSearchParams({
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amount: params.amount
  });
  const res = await fetch(`${API_URL}/swap/quote?${query.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Quote failed: ${res.status}`);
  }
  return res.json() as Promise<{ routes?: { amountOut?: string; minAmountOut?: string; path?: string[] }[] }>;
}
