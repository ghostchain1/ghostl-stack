import { resolveApiBase } from '../../lib/runtime';
import { jsonWithCsrf } from '../../lib/csrf';
import { apiRequest, formatApiError, type ApiError } from '../../lib/api';

const API_URL = resolveApiBase();
const formatStatus = (error: ApiError) => {
  const info = formatApiError(error);
  return `${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`;
};

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
  const res = await apiRequest('/wallet/bridge', {
    baseUrl: API_URL,
    init: {
      method: 'POST',
      headers: jsonWithCsrf(),
      body: JSON.stringify(params)
    }
  });
  if (!res.ok) {
    throw new Error(formatStatus(res.error));
  }
  return res.data as { tx?: string };
}

export async function getBalance(params: { rpc: string; address: string; token?: string }) {
  const query = new URLSearchParams({
    rpc: params.rpc,
    address: params.address,
    ...(params.token ? { token: params.token } : {})
  });
  const res = await apiRequest<{ address: string; balance: string; token?: string }>(
    `/wallet/token/balance?${query.toString()}`,
    { baseUrl: API_URL }
  );
  if (!res.ok) {
    throw new Error(formatStatus(res.error));
  }
  return res.data;
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
  const res = await apiRequest<{ tx: string }>('/wallet/send', {
    baseUrl: API_URL,
    init: { method: 'POST', headers: jsonWithCsrf(), body: JSON.stringify(params) }
  });
  if (!res.ok) {
    throw new Error(formatStatus(res.error));
  }
  return res.data;
}

export async function fundWallet(params: {
  walletId: string;
  chainId?: 'l1' | 'l2' | 'l3';
  amount: string;
  data?: string;
}) {
  const res = await apiRequest<{ tx: string; from?: string; to?: string; chainId?: string }>('/wallet/fund', {
    baseUrl: API_URL,
    init: { method: 'POST', headers: jsonWithCsrf(), body: JSON.stringify(params) }
  });
  if (!res.ok) {
    throw new Error(formatStatus(res.error));
  }
  return res.data;
}

export async function swapTokens(params: {
  walletId: string;
  chainId: 'l1' | 'l2' | 'l3';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  recipient: string;
}) {
  const res = await apiRequest<{ tx: string; note?: string }>('/wallet/swap', {
    baseUrl: API_URL,
    init: { method: 'POST', headers: jsonWithCsrf(), body: JSON.stringify(params) }
  });
  if (!res.ok) {
    throw new Error(formatStatus(res.error));
  }
  return res.data;
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
  const res = await apiRequest<{ routes?: SwapRoute[] }>(`/swap/quote?${query.toString()}`, { baseUrl: API_URL });
  if (!res.ok) {
    throw new Error(formatStatus(res.error));
  }
  return res.data;
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
  const res = await apiRequest<{ tx?: string; routeId?: string }>('/swap/execute', {
    baseUrl: API_URL,
    init: { method: 'POST', headers: jsonWithCsrf(), body: JSON.stringify(params) }
  });
  if (!res.ok) {
    throw new Error(formatStatus(res.error));
  }
  return res.data;
}

export async function getTxReceipt(params: { chainId: 'l1' | 'l2' | 'l3'; tx: string }) {
  const query = new URLSearchParams({
    chainId: params.chainId,
    tx: params.tx
  });
  const res = await apiRequest<{
    status: 'pending' | 'confirmed';
    tx: string;
    chainId: string;
    blockNumber?: number;
    gasUsed?: string;
    effectiveGasPrice?: string | null;
    from?: string;
    to?: string | null;
  }>(`/wallet/tx/receipt?${query.toString()}`, { baseUrl: API_URL });
  if (!res.ok) {
    throw new Error(formatStatus(res.error));
  }
  return res.data;
}
