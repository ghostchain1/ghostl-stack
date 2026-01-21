'use client';

import { formatUnits, parseUnits } from 'ethers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { tokensForChain, TokenConfig, SupportedChain } from './tokens';
import {
  bridgeTransfer,
  getBalance as apiGetBalance,
  sendFunds,
  swapTokens,
  getSwapQuote,
  executeSwap,
  type SwapRoute
} from './api';
import { resolveApiBase } from '../../lib/runtime';
import { apiRequest, formatApiError, type ApiError } from '../../lib/api';
import type { RpcEndpoint } from '@ghostl/types/integrations';

type ChainConfig = {
  id: number;
  name: string;
  rpc: string;
};

const baseChainConfigs: Record<SupportedChain, ChainConfig> = {
  l1: {
    id: Number(process.env.NEXT_PUBLIC_L1_CHAIN_ID || 14000101),
    name: 'GhostChain',
    rpc: ''
  },
  l2: {
    id: Number(process.env.NEXT_PUBLIC_L2_CHAIN_ID || 901),
    name: 'GhostL2',
    rpc: ''
  },
  l3: {
    id: Number(process.env.NEXT_PUBLIC_L3_CHAIN_ID || 903),
    name: 'GhostL3',
    rpc: ''
  }
};

const tokenKey = (token: TokenConfig) => `${token.chain}:${token.address || 'native'}`;

export function useWallet() {
  const [walletId, setWalletId] = useState<string>('');
  const [account, setAccount] = useState<string | null>(null);
  const [chain, setChain] = useState<SupportedChain>('l2');
  const [status, setStatus] = useState<string>('');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [selectedToken, setSelectedToken] = useState<TokenConfig>(tokensForChain('l2')[0]);
  const [selectedOutToken, setSelectedOutToken] = useState<TokenConfig>(tokensForChain('l2')[0]);
  const [bridgeStatus, setBridgeStatus] = useState<string>('');
  const [bridgeHash, setBridgeHash] = useState<string>('');
  const [swapRoutes, setSwapRoutes] = useState<SwapRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<number>(0);
  const [swapQuoteError, setSwapQuoteError] = useState<string>('');
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [externalTokens, setExternalTokens] = useState<TokenConfig[]>([]);
  const [swapAmount, setSwapAmount] = useState<string>('');
  const [chainConfigs, setChainConfigs] = useState<Record<SupportedChain, ChainConfig>>(baseChainConfigs);
  const [rpcRegistryError, setRpcRegistryError] = useState<string>('');
  const [tokenListError, setTokenListError] = useState<string>('');
  const formatStatus = (error: ApiError) => {
    const info = formatApiError(error);
    return `${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`;
  };

  useEffect(() => {
    const loadRpcRegistry = async () => {
      try {
        const res = await apiRequest<RpcEndpoint[]>('/integrations/rpc', { baseUrl: resolveApiBase() });
        if (!res.ok) {
          setRpcRegistryError(formatStatus(res.error));
          return;
        }
        const endpoints = res.data;
        const next = { ...baseChainConfigs };
        const pickRpc = (chainId: number) =>
          endpoints.find((endpoint) => Number(endpoint.chainId) === chainId && endpoint.url?.startsWith('http'))?.url ||
          '';
        next.l1.rpc = pickRpc(next.l1.id);
        next.l2.rpc = pickRpc(next.l2.id);
        next.l3.rpc = pickRpc(next.l3.id);
        setChainConfigs(next);
        setRpcRegistryError('');
      } catch (err) {
        const info = formatApiError({
          message: err instanceof Error ? err.message : 'rpc_registry_unreachable',
          endpoint: `${resolveApiBase()}/integrations/rpc`,
          method: 'GET'
        });
        setRpcRegistryError(`${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`);
      }
    };
    loadRpcRegistry().catch(() => undefined);
  }, []);

  const chainTokens = useMemo(() => {
    const fromDefaults = tokensForChain(chain);
    const extras = externalTokens.filter((t) => t.chain === chain);
    const dedup = new Map<string, TokenConfig>();
    [...fromDefaults, ...extras].forEach((t) => {
      const key = `${t.chain}:${t.address || 'native'}`;
      if (!dedup.has(key)) dedup.set(key, t);
    });
    return Array.from(dedup.values());
  }, [chain, externalTokens]);

  useEffect(() => {
    setSelectedToken(chainTokens[0]);
    setSelectedOutToken(chainTokens[0]);
  }, [chainTokens]);

  const setActiveWallet = useCallback(
    (id: string, address: string, defaultChain?: SupportedChain) => {
      setWalletId(id);
      setAccount(address);
      if (defaultChain) {
        setChain(defaultChain);
      }
    },
    []
  );

  const refreshBalances = useCallback(
    async (acct?: string, targetChain?: SupportedChain) => {
      const address = acct || account;
      const activeChain = targetChain || chain;
      if (!address) return;
      try {
        const entries = await Promise.all(
          tokensForChain(activeChain).map(async (t) => {
            const rpc = chainConfigs[activeChain].rpc;
            if (!rpc) {
              throw new Error('rpc_registry_unavailable');
            }
            if (t.type === 'native') {
              const res = await apiGetBalance({ rpc, address });
              return [tokenKey(t), formatUnits(BigInt(res.balance), t.decimals)];
            }
            if (!t.address) return [tokenKey(t), '0'];
            const res = await apiGetBalance({ rpc, address, token: t.address });
            return [tokenKey(t), formatUnits(BigInt(res.balance), t.decimals)];
          })
        );
        setBalances((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch balances';
        setStatus(msg);
      }
    },
    [account, chain, chainConfigs]
  );

  useEffect(() => {
    if (account) {
      refreshBalances(account, chain).catch(() => undefined);
    }
  }, [account, chain, refreshBalances]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_TOKEN_LIST_URL;
    if (!url) return;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const info = formatApiError({
            message: 'token_list_fetch_failed',
            status: r.status,
            endpoint: url,
            method: 'GET',
            hint: 'Check NEXT_PUBLIC_TOKEN_LIST_URL or token list service.'
          });
          throw new Error(`${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`);
        }
        return r.json();
      })
      .then((j) => {
        if (!Array.isArray(j.tokens)) {
          const info = formatApiError({
            message: 'token_list_invalid_shape',
            endpoint: url,
            method: 'GET',
            hint: 'Token list must include a tokens[] array.'
          });
          setTokenListError(`${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`);
          return;
        }
        const mapped: TokenConfig[] = j.tokens
          .map((t: Record<string, unknown>) => {
            const chainId = Number(t.chainId as number | string | undefined);
            const entry: [SupportedChain, number][] = [
              ['l1', chainConfigs.l1.id],
              ['l2', chainConfigs.l2.id],
              ['l3', chainConfigs.l3.id]
            ];
            const chainMatch = entry.find((e) => e[1] === chainId);
            if (!chainMatch || typeof t.address !== 'string') return null;
            return {
              chain: chainMatch[0],
              address: t.address,
              symbol: (t.symbol as string) || (t.name as string) || 'TOK',
              decimals: Number(t.decimals ?? 18),
              type: 'erc20' as const
            };
          })
          .filter(Boolean) as TokenConfig[];
        setExternalTokens(mapped);
        setTokenListError('');
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Token list fetch failed';
        setTokenListError(message);
      });
  }, []);

  const connect = useCallback(async () => {
    setStatus('Select a GhostWallet to continue.');
  }, []);

  const switchChain = useCallback(
    async (target: SupportedChain) => {
      setChain(target);
      setStatus('');
      if (account) {
        await refreshBalances(account, target);
      }
    },
    [account, refreshBalances]
  );

  const send = useCallback(
    async (to: string, amount: string) => {
      if (!walletId) {
        setStatus('Select a GhostWallet first.');
        return;
      }
      try {
        setStatus('Sending transaction...');
        const parsed = parseUnits(amount || '0', selectedToken.decimals).toString();
        const result = await sendFunds({
          walletId,
          chainId: chain,
          to,
          amount: parsed,
          token: selectedToken.type === 'erc20' ? selectedToken.address : undefined
        });
        setStatus(`Sent: ${result.tx}`);
        await refreshBalances(account || undefined, chain);
        return result.tx;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        setStatus(msg);
        throw err;
      }
    },
    [account, chain, refreshBalances, selectedToken, walletId]
  );

  const bridgeToL3 = useCallback(
    async (amount: string, recipient?: string) => {
      if (!walletId) throw new Error('Select a GhostWallet first.');
      const token = selectedToken;
      const desiredRecipient = recipient || account || '';
      if (!desiredRecipient) throw new Error('Missing recipient');
      setBridgeStatus('Submitting bridge transfer...');
      setBridgeHash('');
      try {
        const parsed = parseUnits(amount, token.decimals).toString();
        const target = chain === 'l2' ? 'l3' : 'l2';
        const res = await bridgeTransfer({
          walletId,
          fromChain: chain,
          toChain: target,
          token: token.type === 'erc20' ? token.address : undefined,
          to: desiredRecipient,
          amount: parsed
        });
        setBridgeHash(res.tx);
        setBridgeStatus('Transfer submitted');
        return res.tx;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Bridge failed';
        setBridgeStatus(msg);
        throw err;
      }
    },
    [account, chain, selectedToken, walletId]
  );

  const fetchSwapQuote = useCallback(
    async (amount: string) => {
      if (!selectedToken.address || !selectedOutToken.address) {
        setSwapRoutes([]);
        return null;
      }
      try {
        const res = await getSwapQuote({
          tokenIn: selectedToken.address,
          tokenOut: selectedOutToken.address,
          amount: parseUnits(amount || '0', selectedToken.decimals).toString()
        });
        const routes = res.routes || [];
        setSwapRoutes(routes);
        setSelectedRoute(0);
        setSwapQuoteError('');
        return routes[0] || null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Quote failed';
        setSwapRoutes([]);
        setSwapQuoteError(msg);
        return null;
      }
    },
    [selectedOutToken, selectedToken]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSwapQuote(swapAmount).catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchSwapQuote, swapAmount, selectedToken, selectedOutToken]);

  const selectedRouteObj = useMemo(() => swapRoutes[selectedRoute], [swapRoutes, selectedRoute]);

  return {
    walletId,
    account,
    chain,
    status,
    balances,
    chainConfigs,
    tokens: chainTokens,
    connect,
    refreshBalances,
    switchChain,
    send,
    selectedToken,
    setSelectedToken,
    bridgeStatus,
    bridgeHash,
    bridgeToL3,
    sendViaApi: send,
    swapViaApi: async (amount: string, recipient: string) => {
      if (!walletId) throw new Error('Select a GhostWallet first.');
      if (!selectedToken.address || !selectedOutToken.address) {
        return sendFunds({
          walletId,
          chainId: chain,
          to: recipient,
          amount: parseUnits(amount, selectedToken.decimals).toString(),
          token: selectedToken.type === 'erc20' ? selectedToken.address : undefined
        });
      }

      const route = swapRoutes[selectedRoute];
      if (route) {
        const amountInStr = parseUnits(amount, selectedToken.decimals).toString();
        let minOut = route.minAmountOut || route.amountOut;
        if (route.amountOut && slippageBps >= 0) {
          try {
            const out = BigInt(route.amountOut);
            const adjusted = (out * BigInt(10000 - slippageBps)) / BigInt(10000);
            minOut = adjusted.toString();
          } catch {
            // ignore parse errors
          }
        }
        return executeSwap({
          tokenIn: selectedToken.address,
          tokenOut: selectedOutToken.address,
          amountIn: amountInStr,
          minAmountOut: minOut,
          path: route.path,
          routeId: route.id,
          recipient,
          walletId,
          chainId: chain
        });
      }
      return swapTokens({
        walletId,
        chainId: chain,
        tokenIn: selectedToken.address,
        tokenOut: selectedOutToken.address,
        amountIn: parseUnits(amount, selectedToken.decimals).toString(),
        recipient
      });
    },
    bridgeViaApi: async (amount: string, to: string) =>
      bridgeTransfer({
        walletId,
        fromChain: chain,
        toChain: chain === 'l2' ? 'l3' : 'l2',
        token: selectedToken.type === 'erc20' ? selectedToken.address : undefined,
        to,
        amount: parseUnits(amount, selectedToken.decimals).toString()
      }),
    swapRoutes,
    swapQuoteError,
    fetchSwapQuote,
    swapAmount,
    setSwapAmount,
    selectedRoute,
    setSelectedRoute,
    selectedRouteObj,
    slippageBps,
    setSlippageBps,
    selectedOutToken,
    setSelectedOutToken,
    setActiveWallet,
    rpcRegistryError,
    tokenListError
  };
}
