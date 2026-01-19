import { resolveApiBase } from '../../lib/runtime';
import { jsonWithCsrf } from '../../lib/csrf';

const API_URL = resolveApiBase();

export async function bridgeTransfer(params: {
  walletId: string;
  fromChain: 'l1' | 'l2' | 'l3';
  toChain?: 'l1' | 'l2' | 'l3';
  token?: string;
  to: string;
  amount: string;
  gasPrice?: string;
  gasLimit?: string;
}) {
  const res = await fetch(`${API_URL}/wallet/bridge`, {
    method: 'POST',
    headers: jsonWithCsrf(),
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
  walletId: string;
  chainId: 'l1' | 'l2' | 'l3';
  to: string;
  amount: string;
  token?: string;
  gasPrice?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  data?: string;
}) {
  const res = await fetch(`${API_URL}/wallet/send`, {
    method: 'POST',
    headers: jsonWithCsrf(),
    credentials: 'include',
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Send failed: ${res.status}`);
  }
  return res.json() as Promise<{ tx: string }>;
}

export async function fundWallet(params: {
  walletId: string;
  chainId?: 'l1' | 'l2' | 'l3';
  amount: string;
  data?: string;
}) {
  const res = await fetch(`${API_URL}/wallet/fund`, {
    method: 'POST',
    headers: jsonWithCsrf(),
    credentials: 'include',
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Fund failed: ${res.status}`);
  }
  return res.json() as Promise<{ tx: string; from?: string; to?: string; chainId?: string }>;
}

export async function swapTokens(params: {
  walletId: string;
  chainId: 'l1' | 'l2' | 'l3';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  recipient: string;
}) {
  const res = await fetch(`${API_URL}/wallet/swap`, {
    method: 'POST',
    headers: jsonWithCsrf(),
    credentials: 'include',
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Swap failed: ${res.status}`);
  }
  return res.json() as Promise<{ tx: string; note?: string }>;
}

export type SwapRoute = {
  id?: string;
  amountOut?: string;
  minAmountOut?: string;
  path?: string[];
  dex?: string;
  feeBps?: number;
  priceImpactBps?: number;
};

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
  return res.json() as Promise<{ routes?: SwapRoute[] }>;
}

export async function executeSwap(params: {
  walletId: string;
  chainId: 'l1' | 'l2' | 'l3';
  routeId?: string;
  path?: string[];
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut?: string;
  recipient: string;
}) {
  const res = await fetch(`${API_URL}/swap/execute`, {
    method: 'POST',
    headers: jsonWithCsrf(),
    credentials: 'include',
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Swap execute failed: ${res.status}`);
  }
  return res.json() as Promise<{ tx?: string; routeId?: string }>;
}

export async function getTxReceipt(params: { chainId: 'l1' | 'l2' | 'l3'; tx: string }) {
  const query = new URLSearchParams({
    chainId: params.chainId,
    tx: params.tx
  });
  const res = await fetch(`${API_URL}/wallet/tx/receipt?${query.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Receipt failed: ${res.status}`);
  }
  return res.json() as Promise<{
    status: 'pending' | 'confirmed';
    tx: string;
    chainId: string;
    blockNumber?: number;
    gasUsed?: string;
    effectiveGasPrice?: string | null;
    from?: string;
    to?: string | null;
  }>;
}
