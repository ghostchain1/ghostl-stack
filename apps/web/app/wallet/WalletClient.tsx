'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import { useSession } from '../../src/modules/identity-access/session';
import { useWallet } from '../../src/modules/wallet/useWallet';
import type { TokenConfig } from '../../src/modules/wallet/tokens';
import type { WalletRecord, TokenRecord } from '@ghostl/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const bridgeAddress = process.env.NEXT_PUBLIC_BRIDGE_ADDRESS || '';

const tokenKey = (t: TokenConfig) => `${t.chain}:${t.address || 'native'}`;

export function WalletClient() {
  const session = useSession();
  const {
    account,
    chain,
    chainConfigs,
    balances,
    status,
    chainWarning,
    tokens,
    connect,
    switchChain,
    send,
    selectedToken,
    setSelectedToken,
    bridgeStatus,
    bridgeHash,
    bridgeToL3,
    sendViaApi,
    swapViaApi,
    bridgeViaApi,
    swapRoutes,
    swapQuoteError,
    fetchSwapQuote,
    selectedRoute,
    setSelectedRoute,
    slippageBps,
    setSlippageBps,
    selectedOutToken,
    setSelectedOutToken
  } = useWallet();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [bridgeAmount, setBridgeAmount] = useState('0.01');
  const [bridgeRecipient, setBridgeRecipient] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [swapAmount, setSwapAmount] = useState('0.01');
  const [swapRecipient, setSwapRecipient] = useState('');
  const [quoteTimer, setQuoteTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [inventory, setInventory] = useState<WalletRecord[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState('');
  const [watchForm, setWatchForm] = useState<{ label: string; address: string; chainId: string; ownerUserId: string }>({
    label: '',
    address: '',
    chainId: 'l2',
    ownerUserId: ''
  });
  const [custodialForm, setCustodialForm] = useState<{ label: string; chainId: string; ownerUserId: string }>({
    label: '',
    chainId: 'l2',
    ownerUserId: ''
  });
  const [exportedKey, setExportedKey] = useState<string>('');
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [tokensInv, setTokensInv] = useState<WalletRecord[]>([]);
  const [tokenList, setTokenList] = useState<TokenRecord[]>([]);
  const [tokenStatus, setTokenStatus] = useState('');
  const [tokenForm, setTokenForm] = useState<{ address: string; chainId: string; type: TokenRecord['type']; rpc?: string }>({
    address: '',
    chainId: 'l2',
    type: 'erc20',
    rpc: ''
  });

  const selectedRouteObj = useMemo(() => swapRoutes[selectedRoute], [swapRoutes, selectedRoute]);

  useEffect(() => {
    if (account && !bridgeRecipient) {
      setBridgeRecipient(account);
    }
    if (account && !swapRecipient) {
      setSwapRecipient(account);
    }
  }, [account, bridgeRecipient, swapRecipient]);

  useEffect(() => {
    if (quoteTimer) clearTimeout(quoteTimer);
    const timer = setTimeout(() => {
      fetchSwapQuote(swapAmount).catch(() => undefined);
    }, 300);
    setQuoteTimer(timer);
    return () => clearTimeout(timer);
  }, [fetchSwapQuote, swapAmount, quoteTimer]);

  const chainLabels = useMemo(
    () => ({
      l1: 'GhostL1',
      l2: 'GhostL2',
      l3: 'GhostL3'
    }),
    []
  );

  const loadInventory = async () => {
    setInventoryStatus('Loading wallets...');
    try {
      const res = await fetch(`${API_URL}/wallets`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Load failed ${res.status}`);
      const data = (await res.json()) as WalletRecord[];
      setInventory(data);
      setTokensInv(data);
      if (!selectedWalletId && data.length) {
        setSelectedWalletId(data[0].id);
      }
      setInventoryStatus('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load wallets';
      setInventoryStatus(msg);
    }
  };

  useEffect(() => {
    if (session.user) {
      loadInventory().catch(() => undefined);
    }
  }, [session.user?.id]);

  useEffect(() => {
    const loadTokens = async () => {
      if (!selectedWalletId) return;
      setTokenStatus('Loading tokens...');
      try {
        const res = await fetch(`${API_URL}/wallets/${selectedWalletId}/tokens`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Load failed ${res.status}`);
        const data = (await res.json()) as TokenRecord[];
        setTokenList(data);
        setTokenStatus('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load tokens';
        setTokenStatus(msg);
      }
    };
    loadTokens().catch(() => undefined);
  }, [selectedWalletId]);

  const createWatchWallet = async () => {
    if (!watchForm.address || !watchForm.label) {
      setInventoryStatus('Label and address required');
      return;
    }
    setInventoryStatus('Creating watch wallet...');
    try {
      const res = await fetch(`${API_URL}/wallets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...watchForm, ownerUserId: watchForm.ownerUserId || undefined })
      });
      if (!res.ok) throw new Error(`Create failed ${res.status}`);
      await loadInventory();
      setWatchForm({ ...watchForm, label: '', address: '' });
      setInventoryStatus('Watch wallet added');
      setTimeout(() => setInventoryStatus(''), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      setInventoryStatus(msg);
    }
  };

  const createCustodialWallet = async () => {
    if (!custodialForm.label) {
      setInventoryStatus('Label required');
      return;
    }
    setInventoryStatus('Creating custodial wallet...');
    try {
      const res = await fetch(`${API_URL}/wallets/custodial`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...custodialForm, ownerUserId: custodialForm.ownerUserId || undefined })
      });
      if (!res.ok) throw new Error(`Create failed ${res.status}`);
      const body = (await res.json()) as { wallet: WalletRecord; exportedKey?: string };
      setExportedKey(body.exportedKey || '');
      await loadInventory();
      setCustodialForm({ ...custodialForm, label: '' });
      setInventoryStatus('Custodial wallet created');
      setTimeout(() => setInventoryStatus(''), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      setInventoryStatus(msg);
    }
  };

  const rotateManagedWallet = async (id: string) => {
    setInventoryStatus('Rotating key...');
    try {
      const res = await fetch(`${API_URL}/wallets/${id}/rotate`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`Rotate failed ${res.status}`);
      const body = (await res.json()) as { wallet: WalletRecord; exportedKey?: string };
      setExportedKey(body.exportedKey || '');
      await loadInventory();
      setInventoryStatus('Key rotated');
      setTimeout(() => setInventoryStatus(''), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rotate failed';
      setInventoryStatus(msg);
    }
  };

  const revokeWallet = async (id: string) => {
    setInventoryStatus('Revoking wallet...');
    try {
      const res = await fetch(`${API_URL}/wallets/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`Revoke failed ${res.status}`);
      await loadInventory();
      setInventoryStatus('Wallet revoked');
      setTimeout(() => setInventoryStatus(''), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Revoke failed';
      setInventoryStatus(msg);
    }
  };

  const applyManagedWallet = (wallet: WalletRecord) => {
    setTo(wallet.address);
    setBridgeRecipient(wallet.address);
    if (wallet.chainId === 'l1' || wallet.chainId === 'l2' || wallet.chainId === 'l3') {
      switchChain(wallet.chainId).catch(() => undefined);
    }
    setSelectedWalletId(wallet.id);
  };

  const importToken = async () => {
    if (!selectedWalletId || !tokenForm.address) {
      setTokenStatus('Wallet + address required');
      return;
    }
    setTokenStatus('Importing token...');
    try {
      const res = await fetch(`${API_URL}/wallets/${selectedWalletId}/tokens/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...tokenForm, rpc: tokenForm.rpc || undefined })
      });
      if (!res.ok) throw new Error(`Import failed ${res.status}`);
      await res.json();
      setTokenForm((f) => ({ ...f, address: '' }));
      setTokenStatus('Token imported');
      setTimeout(() => setTokenStatus(''), 2000);
      const resList = await fetch(`${API_URL}/wallets/${selectedWalletId}/tokens`, { credentials: 'include' });
      if (resList.ok) setTokenList((await resList.json()) as TokenRecord[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setTokenStatus(msg);
    }
  };

  const balanceList = useMemo(
    () =>
      tokens.map((t) => ({
        token: t,
        display: `${balances[tokenKey(t)] || '0'} ${t.symbol}`
      })),
    [tokens, balances]
  );

  const handleSend = async () => {
    try {
      if (privateKey) {
        await sendViaApi(to, amount, { privateKey });
      } else {
        await send(to, amount);
      }
    } catch {
      // status already set in hook
    }
  };

  const handleBridge = async () => {
    try {
      if (privateKey) {
        await bridgeViaApi(bridgeAmount, bridgeRecipient || account || '', privateKey);
      } else {
        await bridgeToL3(bridgeAmount, bridgeRecipient || account || undefined);
      }
    } catch {
      // status already set in hook
    }
  };

  return (
    <div className="content">
      <div className="card-grid">
        <Card title="Wallet" subtitle={`Connect to ${chainConfigs[chain].name}`}>
          <div className="stack">
            <Button onClick={connect}>{account ? 'Reconnect' : 'Connect wallet'}</Button>
            <div className="inline-form" style={{ gap: 8 }}>
              <span className="muted">Chain</span>
              <select className="select" value={chain} onChange={(e) => switchChain(e.target.value as typeof chain)}>
                <option value="l1">GhostL1</option>
                <option value="l2">GhostL2</option>
                <option value="l3">GhostL3</option>
              </select>
            </div>
            <div className="stack">
              <div className="spread">
                <span className="muted">Account</span>
                <span>{account || 'Not connected'}</span>
              </div>
              {balanceList.map((b) => (
                <div className="spread" key={tokenKey(b.token)}>
                  <span className="muted">{b.token.symbol} balance</span>
                  <Badge>{b.display}</Badge>
                </div>
              ))}
            </div>
          {status && <span className="muted">{status}</span>}
          {chainWarning && (
            <div className="stack">
              <span className="muted" style={{ color: '#f97316' }}>
                {chainWarning}
                </span>
                <Button onClick={connect} variant="secondary">
                  Switch wallet to {chainConfigs[chain].name}
                </Button>
              </div>
            )}
            {!session.user && <span className="muted">Login required to use wallet actions.</span>}
            <div className="stack" style={{ marginTop: 8 }}>
              <span className="muted">Optional API signer (private key)</span>
              <input
                className="input"
                placeholder="0x..."
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
              />
              <span className="muted" style={{ fontSize: 12 }}>
                If provided, sends/bridges/swaps use backend signing over RPC. Leave blank to use injected wallet.
              </span>
            </div>
          </div>
        </Card>
        <Card title="Token import & balances" subtitle="ERC-20/721/1155 discovery">
          <div className="stack" style={{ gap: 10 }}>
            <div className="inline-form" style={{ gap: 8 }}>
              <span className="muted">Wallet</span>
              <select className="select" value={selectedWalletId} onChange={(e) => setSelectedWalletId(e.target.value)}>
                <option value="">Select wallet</option>
                {tokensInv.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label} · {w.address.slice(0, 8)}… · {chainLabels[w.chainId] || w.chainId}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid-3">
              <input className="input" placeholder="Token contract address" value={tokenForm.address} onChange={(e) => setTokenForm((f) => ({ ...f, address: e.target.value }))} />
              <select className="select" value={tokenForm.chainId} onChange={(e) => setTokenForm((f) => ({ ...f, chainId: e.target.value }))}>
                <option value="l1">L1</option>
                <option value="l2">L2</option>
                <option value="l3">L3</option>
              </select>
              <select className="select" value={tokenForm.type} onChange={(e) => setTokenForm((f) => ({ ...f, type: e.target.value as TokenRecord['type'] }))}>
                <option value="erc20">ERC-20</option>
                <option value="erc721">ERC-721</option>
                <option value="erc1155">ERC-1155</option>
              </select>
            </div>
            <input className="input" placeholder="RPC (optional, for metadata)" value={tokenForm.rpc || ''} onChange={(e) => setTokenForm((f) => ({ ...f, rpc: e.target.value }))} />
            <div className="inline-form" style={{ gap: 8 }}>
              <Button onClick={importToken} disabled={!selectedWalletId}>
                Import token
              </Button>
              {tokenStatus && <span className="muted">{tokenStatus}</span>}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {!tokenList.length && <span className="muted">No imported tokens yet.</span>}
              {tokenList.map((t) => (
                <div key={t.id} className="spread" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                  <div className="stack" style={{ gap: 2 }}>
                    <strong>{t.symbol}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {t.name} · {t.address.slice(0, 8)}… · {t.type}
                    </span>
                  </div>
                  <div className="inline-form" style={{ gap: 6 }}>
                    <Badge tone="default">{chainLabels[t.chainId] || t.chainId}</Badge>
                    <Badge tone="default">{t.type}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card title="Cross-layer bridge planner" subtitle="Plan L1 ↔ L2 ↔ L3 flows">
          <div className="stack">
            <div className="grid-3">
              <label className="stack">
                <span className="muted">From chain</span>
                <select className="select" value={chain} onChange={(e) => switchChain(e.target.value as typeof chain)}>
                  <option value="l1">L1</option>
                  <option value="l2">L2</option>
                  <option value="l3">L3</option>
                </select>
              </label>
              <label className="stack">
                <span className="muted">To chain</span>
                <select className="select" value={chain === 'l3' ? 'l2' : chain === 'l2' ? 'l1' : 'l2'} readOnly>
                  <option value="l1">L1</option>
                  <option value="l2">L2</option>
                  <option value="l3">L3</option>
                </select>
              </label>
              <label className="stack">
                <span className="muted">Amount</span>
                <input className="input" value={bridgeAmount} onChange={(e) => setBridgeAmount(e.target.value)} />
              </label>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Bridge planner uses current chain as source; destination auto-steps down/up the stack for staged messaging. Use main bridge action for actual submit.
            </div>
            <Button variant="secondary" onClick={() => setBridgeStatus(`Planned route ${chain.toUpperCase()} → ${chain === 'l3' ? 'L2' : chain === 'l2' ? 'L1' : 'L2'} for ${bridgeAmount}`)}>
              Simulate plan
            </Button>
          </div>
        </Card>
        <Card title="Send" subtitle="Simple transfer">
          <div className="stack">
            <div className="inline-form" style={{ gap: 8 }}>
              <span className="muted">Token</span>
              <select
                className="select"
                value={selectedToken.address || `native-${selectedToken.chain}`}
                onChange={(e) => {
                  const t = tokens.find((tok) => (tok.address || `native-${tok.chain}`) === e.target.value);
                  if (t) setSelectedToken(t);
                }}
              >
                {tokens.map((t) => (
                  <option key={t.address || `native-${t.chain}`} value={t.address || `native-${t.chain}`}>
                    {t.symbol} ({chainConfigs[t.chain].name})
                  </option>
                ))}
              </select>
            </div>
            <input className="input" placeholder="to address" value={to} onChange={(e) => setTo(e.target.value)} />
            <input
              className="input"
              placeholder={`amount ${selectedToken.symbol}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button onClick={handleSend} disabled={!account}>
              Send
            </Button>
          </div>
        </Card>
        <Card title="Bridge" subtitle="L2 → L3 bridge call (user-signed)">
          <div className="stack">
            <div className="inline-form" style={{ gap: 8 }}>
              <span className="muted">Recipient (L3)</span>
              <input
                className="input"
                placeholder="recipient on L3"
                value={bridgeRecipient}
                onChange={(e) => setBridgeRecipient(e.target.value)}
              />
            </div>
            <input
              className="input"
              placeholder={`amount ${selectedToken.symbol}`}
              value={bridgeAmount}
              onChange={(e) => setBridgeAmount(e.target.value)}
            />
            <div className="muted">
              Bridge contract: <code>{bridgeAddress || 'missing NEXT_PUBLIC_BRIDGE_ADDRESS'}</code>
            </div>
            <Button onClick={handleBridge} disabled={!account || chain !== 'l2'}>
              Send to L3 bridge
            </Button>
            {chain !== 'l2' && <span className="muted">Switch to GhostL2 to start a bridge deposit.</span>}
            {bridgeStatus && <span className="muted">{bridgeStatus}</span>}
            {bridgeHash && (
              <span className="muted">
                Tx: <code>{bridgeHash}</code>
              </span>
            )}
          </div>
        </Card>
        <Card title="Wallet management" subtitle="API-backed registry (watch + custodial)">
          <div className="stack" style={{ gap: 12 }}>
            <div className="grid-3">
              <div className="stack">
                <span className="muted">Add watch-only</span>
                <input className="input" placeholder="Label" value={watchForm.label} onChange={(e) => setWatchForm((f) => ({ ...f, label: e.target.value }))} />
                <input className="input" placeholder="Address 0x..." value={watchForm.address} onChange={(e) => setWatchForm((f) => ({ ...f, address: e.target.value }))} />
                <div className="inline-form" style={{ gap: 8 }}>
                  <select className="select" value={watchForm.chainId} onChange={(e) => setWatchForm((f) => ({ ...f, chainId: e.target.value }))}>
                    <option value="l1">L1</option>
                    <option value="l2">L2</option>
                    <option value="l3">L3</option>
                  </select>
                  <input className="input" placeholder="Owner user id (optional)" value={watchForm.ownerUserId} onChange={(e) => setWatchForm((f) => ({ ...f, ownerUserId: e.target.value }))} />
                </div>
                <Button variant="secondary" onClick={createWatchWallet}>
                  Save watch wallet
                </Button>
              </div>
              <div className="stack">
                <span className="muted">Create custodial (key returns once)</span>
                <input className="input" placeholder="Label" value={custodialForm.label} onChange={(e) => setCustodialForm((f) => ({ ...f, label: e.target.value }))} />
                <div className="inline-form" style={{ gap: 8 }}>
                  <select className="select" value={custodialForm.chainId} onChange={(e) => setCustodialForm((f) => ({ ...f, chainId: e.target.value }))}>
                    <option value="l1">L1</option>
                    <option value="l2">L2</option>
                    <option value="l3">L3</option>
                  </select>
                  <input className="input" placeholder="Owner user id (optional)" value={custodialForm.ownerUserId} onChange={(e) => setCustodialForm((f) => ({ ...f, ownerUserId: e.target.value }))} />
                </div>
                <Button onClick={createCustodialWallet}>Create custodial</Button>
                {exportedKey && (
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="muted" style={{ fontSize: 12 }}>
                      Exported key (copy once; not stored server-side)
                    </span>
                    <input className="input" value={exportedKey} readOnly />
                  </div>
                )}
              </div>
              <div className="stack">
                <span className="muted">Status</span>
                <div className="pill" style={{ justifyContent: 'space-between' }}>
                  <span>Inventory</span>
                  <span>{inventory.length} wallets</span>
                </div>
                {inventoryStatus && <span className="muted">{inventoryStatus}</span>}
              </div>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {!inventory.length && <span className="muted">No managed wallets yet.</span>}
              {inventory.map((w) => (
                <div
                  key={w.id}
                  className="spread"
                  style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}
                >
                  <div className="stack" style={{ gap: 4 }}>
                    <strong>{w.label}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {w.address}
                    </span>
                    <div className="inline-form" style={{ gap: 6, fontSize: 12 }}>
                      <Badge tone="default">{chainLabels[w.chainId] || w.chainId}</Badge>
                      <Badge tone="default">{w.type}</Badge>
                      {w.keyPreview && <Badge tone="default">key {w.keyPreview}</Badge>}
                      {w.status && <Badge tone="default">{w.status}</Badge>}
                    </div>
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
                    <div className="inline-form" style={{ gap: 6 }}>
                      <Button variant="secondary" onClick={() => applyManagedWallet(w)}>
                        Use
                      </Button>
                      {w.type === 'custodial' && (
                        <Button variant="secondary" onClick={() => rotateManagedWallet(w.id)}>
                          Rotate key
                        </Button>
                      )}
                      <Button variant="secondary" onClick={() => revokeWallet(w.id)}>
                        Revoke
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card title="Swap (passthrough demo)" subtitle="Token transfer via API">
          <div className="stack">
            <div className="inline-form" style={{ gap: 8 }}>
              <span className="muted">Token in</span>
              <select
                className="select"
                value={selectedToken.address || `native-${selectedToken.chain}`}
                onChange={(e) => {
                  const t = tokens.find((tok) => (tok.address || `native-${tok.chain}`) === e.target.value);
                  if (t) setSelectedToken(t);
                }}
              >
                {tokens.map((t) => (
                  <option key={t.address || `native-${t.chain}`} value={t.address || `native-${t.chain}`}>
                    {t.symbol} ({chainConfigs[t.chain].name})
                  </option>
                ))}
              </select>
            </div>
            <div className="inline-form" style={{ gap: 8 }}>
              <span className="muted">Token out</span>
              <select
                className="select"
                value={selectedOutToken.address || `native-${selectedOutToken.chain}`}
                onChange={(e) => {
                  const t = tokens.find((tok) => (tok.address || `native-${tok.chain}`) === e.target.value);
                  if (t) setSelectedOutToken(t);
                }}
              >
                {tokens.map((t) => (
                  <option key={t.address || `native-${t.chain}`} value={t.address || `native-${t.chain}`}>
                    {t.symbol} ({chainConfigs[t.chain].name})
                  </option>
                ))}
              </select>
            </div>
            <input
              className="input"
              placeholder={`amount ${selectedToken.symbol}`}
              value={swapAmount}
              onChange={(e) => setSwapAmount(e.target.value)}
            />
            <input
              className="input"
              placeholder="recipient"
              value={swapRecipient}
              onChange={(e) => setSwapRecipient(e.target.value)}
            />
            <Button
              onClick={async () => {
                if (!privateKey) return;
                try {
                  await swapViaApi(swapAmount, swapRecipient || account || '', privateKey);
                } catch {
                  // status handled in hook
                }
              }}
              disabled={!privateKey}
            >
              Swap via API
            </Button>
            {swapRoutes.length > 0 && (
              <div className="stack">
                <span className="muted" style={{ fontSize: 12 }}>Select route</span>
                <select
                  className="select"
                  value={selectedRoute}
                  onChange={(e) => setSelectedRoute(Number(e.target.value))}
                >
                  {swapRoutes.map((r, idx) => (
                    <option key={r.id || idx} value={idx}>
                      {(r.path || []).join(' → ') || 'direct'} · out {r.amountOut || '?'} min {r.minAmountOut || '?'} {r.dex ? `· ${r.dex}` : ''}
                    </option>
                  ))}
                </select>
                {selectedRouteObj && (
                  <div className="card" style={{ padding: 8 }}>
                    <div className="spread" style={{ fontSize: 12 }}>
                      <span className="muted">DEX</span>
                      <span>{selectedRouteObj.dex || '—'}</span>
                    </div>
                    <div className="spread" style={{ fontSize: 12 }}>
                      <span className="muted">Path</span>
                      <span>{(selectedRouteObj.path || []).join(' → ') || 'direct'}</span>
                    </div>
                    <div className="spread" style={{ fontSize: 12 }}>
                      <span className="muted">Est. out</span>
                      <span>{selectedRouteObj.amountOut || '?'}</span>
                    </div>
                    <div className="spread" style={{ fontSize: 12 }}>
                      <span className="muted">Min. out</span>
                      <span>{selectedRouteObj.minAmountOut || '?'}</span>
                    </div>
                    {selectedRouteObj.feeBps !== undefined && (
                      <div className="spread" style={{ fontSize: 12 }}>
                        <span className="muted">Fee</span>
                        <span>{(selectedRouteObj.feeBps / 100).toFixed(2)}%</span>
                      </div>
                    )}
                    {selectedRouteObj.priceImpactBps !== undefined && (
                      <div className="spread" style={{ fontSize: 12 }}>
                        <span className="muted">Price impact</span>
                        <span>{(selectedRouteObj.priceImpactBps / 100).toFixed(2)}%</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="inline-form" style={{ gap: 8 }}>
                  <span className="muted">Slippage %</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={(slippageBps / 100).toString()}
                    onChange={(e) => setSlippageBps(Math.max(0, Math.round(Number(e.target.value || 0) * 100)))}
                  />
                </div>
              </div>
            )}
            {swapQuoteError && (
              <span className="muted" style={{ color: '#f97316', fontSize: 12 }}>{swapQuoteError}</span>
            )}
            <span className="muted" style={{ fontSize: 12 }}>
              Swap executes via router service when a route is available; falls back to passthrough transfer otherwise. Private key required for API execution.
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
