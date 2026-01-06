'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import { useSession } from '../../src/modules/identity-access/session';
import { useWallet } from '../../src/modules/wallet/useWallet';
import type { TokenConfig } from '../../src/modules/wallet/tokens';

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
  }, [fetchSwapQuote, swapAmount]);

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
              <select
                className="select"
                value={chain}
                onChange={(e) => switchChain(e.target.value as 'l2' | 'l3')}
              >
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
