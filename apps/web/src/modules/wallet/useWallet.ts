'use client';

import { BrowserProvider, Contract, Interface, JsonRpcProvider, formatUnits, parseUnits } from 'ethers';
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

type ChainConfig = {
  id: number;
  name: string;
  rpc: string;
};

const chainConfigs: Record<SupportedChain, ChainConfig> = {
  l2: {
    id: Number(process.env.NEXT_PUBLIC_L2_CHAIN_ID || 7192),
    name: 'GhostL2',
    rpc: process.env.NEXT_PUBLIC_L2_RPC || 'http://localhost:9545'
  },
  l3: {
    id: Number(process.env.NEXT_PUBLIC_L3_CHAIN_ID || 7393),
    name: 'GhostL3',
    rpc: process.env.NEXT_PUBLIC_L3_RPC || 'http://localhost:10545'
  }
};

const erc20Abi = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

const bridgeAbi = [
  'function depositToL3(address to, uint256 amount, uint256 nonce) payable',
  'function depositERC20ToL3(address token, address to, uint256 amount, uint256 nonce)',
  'event DepositInitiated(address indexed from, address indexed to, uint256 amount, uint256 nonce)',
  'event ERC20DepositInitiated(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce)',
  'event Finalized(address indexed from, address indexed to, uint256 amount, uint256 nonce)',
  'event ERC20Finalized(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce)'
];

const bridgeAddress = process.env.NEXT_PUBLIC_BRIDGE_ADDRESS;

const tokenKey = (token: TokenConfig) => `${token.chain}:${token.address || 'native'}`;

export function useWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [chain, setChain] = useState<SupportedChain>('l2');
  const [status, setStatus] = useState<string>('');
  const [chainWarning, setChainWarning] = useState<string>('');
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [selectedToken, setSelectedToken] = useState<TokenConfig>(tokensForChain('l2')[0]);
  const [bridgeStatus, setBridgeStatus] = useState<string>('');
  const [bridgeHash, setBridgeHash] = useState<string>('');
  const [swapRoutes, setSwapRoutes] = useState<SwapRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<number>(0);
  const [swapQuoteError, setSwapQuoteError] = useState<string>('');

  const chainTokens = useMemo(() => tokensForChain(chain), [chain]);

  useEffect(() => {
    setSelectedToken(chainTokens[0]);
  }, [chainTokens]);

  const ensureSigner = useCallback(
    async (target?: SupportedChain) => {
      const eth = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
      if (!eth) throw new Error('No injected wallet found');
      const desiredChain = target || chain;
      const browserProvider = new BrowserProvider(eth);
      let network = await browserProvider.getNetwork();
      if (network.chainId !== BigInt(chainConfigs[desiredChain].id)) {
        try {
          await eth.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + chainConfigs[desiredChain].id.toString(16) }]
          });
          network = await browserProvider.getNetwork();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to switch chain';
          setChainWarning(`Wallet is on ${network.chainId.toString()}, expected ${chainConfigs[desiredChain].id}`);
          throw new Error(msg);
        }
      }
      setChainWarning('');
      const signer = await browserProvider.getSigner();
      return { signer, browserProvider };
    },
    [chain]
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
    [account, chain]
  );

  useEffect(() => {
    if (account) {
      refreshBalances(account, chain).catch(() => undefined);
    }
  }, [account, chain, refreshBalances]);

  const fetchSwapQuote = useCallback(
    async (amount: string) => {
      if (!selectedToken.address) {
        setSwapRoutes([]);
        return null;
      }
      try {
        const res = await getSwapQuote({
          tokenIn: selectedToken.address,
          tokenOut: selectedToken.address,
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
    [selectedToken]
  );

  const connect = useCallback(async () => {
    try {
      const { signer } = await ensureSigner(chain);
      const addr = await signer.getAddress();
      setAccount(addr);
      await refreshBalances(addr, chain);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect wallet';
      setStatus(msg);
    }
  }, [chain, ensureSigner, refreshBalances]);

  const switchChain = useCallback(
    async (target: SupportedChain) => {
      setChain(target);
      setStatus('');
      setChainWarning('');
      if (account) {
        await refreshBalances(account, target);
      }
    },
    [account, refreshBalances]
  );

  const send = useCallback(
    async (to: string, amount: string, opts?: { privateKey?: string }) => {
      if (!selectedToken) throw new Error('No token selected');
      setStatus(`Sending ${amount} ${selectedToken.symbol} on ${chainConfigs[chain].name}...`);
      try {
        const parsed = parseUnits(amount, selectedToken.decimals).toString();
        const rpc = chainConfigs[chain].rpc;
        if (opts?.privateKey) {
          const res = await sendFunds({
            rpc,
            to,
            amount: parsed,
            privateKey: opts.privateKey,
            token: selectedToken.type === 'erc20' ? selectedToken.address : undefined
          });
          setStatus(`Sent via API: ${res.tx}`);
        } else {
          const { signer } = await ensureSigner(chain);
          let tx;
          if (selectedToken.type === 'erc20' && selectedToken.address) {
            const erc20 = new Contract(selectedToken.address, erc20Abi, signer);
            tx = await erc20.transfer(to, parsed);
          } else {
            tx = await signer.sendTransaction({ to, value: parsed });
          }
          await tx.wait();
          setStatus('Sent');
        }
        await refreshBalances(account || undefined, chain);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        setStatus(msg);
        throw err;
      }
    },
    [account, chain, ensureSigner, refreshBalances, selectedToken]
  );

  const pollFinalization = useCallback(
    async ({
      receiptBlock,
      token,
      nonce,
      from,
      to
    }: {
      receiptBlock: number;
      token: TokenConfig;
      nonce: bigint;
      from?: string;
      to?: string;
    }) => {
      if (!bridgeAddress) return false;
      const provider = new JsonRpcProvider(chainConfigs.l2.rpc);
      const iface = new Interface(bridgeAbi);
      const eventName = token.type === 'erc20' && token.address ? 'ERC20Finalized' : 'Finalized';
      for (let i = 0; i < 10; i++) {
        const logs = await provider.getLogs({
          address: bridgeAddress,
          fromBlock: receiptBlock,
          toBlock: 'latest'
        });
        const match = logs
          .map((log) => {
            try {
              return iface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((parsed) => {
            if (!parsed || parsed.name !== eventName || !parsed.args) return false;
            const nonceMatch = parsed.args.nonce === nonce;
            const fromMatch = from ? parsed.args.from?.toLowerCase?.() === from.toLowerCase() : true;
            const toMatch = to ? parsed.args.to?.toLowerCase?.() === to.toLowerCase() : true;
            if (eventName === 'ERC20Finalized' && token.address) {
              const tokenMatch = parsed.args.token?.toLowerCase?.() === token.address.toLowerCase();
              return nonceMatch && fromMatch && toMatch && tokenMatch;
            }
            return nonceMatch && fromMatch && toMatch;
          });
        if (match) {
          setBridgeStatus('Finalized on L2 (ready on L3)');
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      setBridgeStatus('Deposit confirmed; waiting for relayer finalization...');
      return false;
    },
    []
  );

  const bridgeToL3 = useCallback(
    async (amount: string, recipient?: string) => {
      if (!bridgeAddress) throw new Error('Missing NEXT_PUBLIC_BRIDGE_ADDRESS');
      const token = selectedToken;
      const desiredRecipient = recipient || account || '';
      if (!desiredRecipient) throw new Error('Missing recipient');
      setBridgeStatus('Preparing bridge transaction...');
      setBridgeHash('');
      try {
        const { signer } = await ensureSigner('l2');
        const from = await signer.getAddress();
        const parsed = parseUnits(amount, token.decimals);
        const nonce = BigInt(Math.floor(Date.now() / 1000));
        const bridge = new Contract(bridgeAddress, bridgeAbi, signer);

        let tx;
        if (token.type === 'erc20' && token.address) {
          const erc20 = new Contract(token.address, erc20Abi, signer);
          const allowance = await erc20.allowance(from, bridgeAddress);
          if (allowance < parsed) {
            setBridgeStatus('Approving token for bridge...');
            const approveTx = await erc20.approve(bridgeAddress, parsed);
            await approveTx.wait();
          }
          setBridgeStatus('Depositing token to L2 bridge...');
          tx = await bridge.depositERC20ToL3(token.address, desiredRecipient, parsed, nonce);
        } else {
          setBridgeStatus('Depositing native to L2 bridge...');
          tx = await bridge.depositToL3(desiredRecipient, parsed, nonce, { value: parsed });
        }
        setBridgeHash(tx.hash);
        const receipt = await tx.wait();
        setBridgeStatus('Deposit confirmed, watching for finalization...');
        await pollFinalization({ receiptBlock: receipt.blockNumber, token, nonce, from, to: desiredRecipient });
        await refreshBalances(from, 'l2');
        return tx.hash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Bridge failed';
        setBridgeStatus(msg);
        throw err;
      }
    },
    [account, ensureSigner, pollFinalization, refreshBalances, selectedToken]
  );

  return {
    account,
    chain,
    status,
    chainWarning,
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
    swapViaApi: async (amount: string, recipient: string, pk: string) => {
      if (!selectedToken.address) throw new Error('Select an ERC20 token to swap');
      const route = swapRoutes[selectedRoute];
      if (route) {
        return executeSwap({
          tokenIn: selectedToken.address,
          tokenOut: selectedToken.address,
          amountIn: parseUnits(amount, selectedToken.decimals).toString(),
          minAmountOut: route.minAmountOut,
          path: route.path,
          routeId: route.id,
          recipient,
          privateKey: pk
        });
      }
      // fallback to passthrough
      return swapTokens({
        rpc: chainConfigs[chain].rpc,
        tokenIn: selectedToken.address,
        tokenOut: selectedToken.address,
        amountIn: parseUnits(amount, selectedToken.decimals).toString(),
        recipient,
        privateKey: pk
      });
    },
    bridgeViaApi: async (amount: string, to: string, pk: string) =>
      bridgeTransfer({
        fromRpc: chainConfigs[chain].rpc,
        toRpc: chainConfigs[chain === 'l2' ? 'l3' : 'l2'].rpc,
        token: selectedToken.type === 'erc20' ? selectedToken.address : undefined,
        to,
        amount: parseUnits(amount, selectedToken.decimals).toString(),
        privateKey: pk
      }),
    swapRoutes,
    swapQuoteError,
    fetchSwapQuote,
    selectedRoute,
    setSelectedRoute
  };
}
