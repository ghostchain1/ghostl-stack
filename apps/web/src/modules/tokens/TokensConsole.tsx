'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import { apiRequest, type ApiError } from '../../lib/api';
import { jsonWithCsrf, withCsrf } from '../../lib/csrf';
import { normalizeRole, roleOrder } from '../identity-access/access-policy';
import { useSession } from '../identity-access/session';
import { fetchTokens, fetchWallets, type TokenWithWallet, type TokenQuery, type WalletList } from './services';
import { DataFetchErrorCard } from '../../components/DataFetchErrorCard';

type TokenFilters = {
  search: string;
  chainId: 'all' | 'l1' | 'l2' | 'l3';
  type: 'all' | 'erc20' | 'erc721' | 'erc1155';
  walletId: string;
};

export function TokensConsole() {
  const { user } = useSession();
  const role = normalizeRole(user?.role);
  const canReadTokens = roleOrder[role] >= roleOrder.READONLY;
  const canWriteTokens = roleOrder[role] >= roleOrder.OPERATOR;
  const debugTokens = process.env.NEXT_PUBLIC_TOKENS_DEBUG === 'true';
  const [tokens, setTokens] = useState<TokenWithWallet[]>([]);
  const [wallets, setWallets] = useState<WalletList>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensError, setTokensError] = useState<ApiError | null>(null);
  const [walletsError, setWalletsError] = useState<ApiError | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [filters, setFilters] = useState<TokenFilters>({
    search: '',
    chainId: 'all',
    type: 'all',
    walletId: 'all'
  });
  const [importForm, setImportForm] = useState<{
    walletId: string;
    address: string;
    chainId: 'l1' | 'l2' | 'l3';
    type: 'erc20' | 'erc721' | 'erc1155';
    rpc: string;
  }>({
    walletId: '',
    address: '',
    chainId: 'l2',
    type: 'erc20',
    rpc: ''
  });

  const loadWallets = useCallback(async () => {
    const result = await fetchWallets();
    if (!result.ok) {
      setWallets([]);
      setWalletsError(result.error);
      if (debugTokens) {
        console.debug('[tokens] wallets:error', result.error);
      }
      return;
    }
    const next = result.data;
    setWallets(next);
    setWalletsError(null);
    setImportForm((prev) => {
      if (prev.walletId || !next.length) return prev;
      const rawChainId = next[0].chainId;
      const chainId =
        rawChainId === 'l1' || rawChainId === 'l2' || rawChainId === 'l3' ? rawChainId : prev.chainId;
      return { ...prev, walletId: next[0].id, chainId };
    });
    if (debugTokens) {
      console.debug('[tokens] wallets:loaded', { count: next.length });
    }
  }, [debugTokens]);

  const loadTokens = useCallback(
    async (reason: 'load' | 'refresh') => {
      if (!canReadTokens) {
        setTokensLoading(false);
        return;
      }
      setTokensLoading(true);
      setTokensError(null);
      const query: TokenQuery = { cacheBuster: Date.now() };
      if (debugTokens) {
        console.debug('[tokens] fetch:start', { reason, query });
      }
      const result = await fetchTokens(query);
      if (!result.ok) {
        setTokens([]);
        setTokensError(result.error);
        setTokensLoading(false);
        if (debugTokens) {
          console.debug('[tokens] fetch:error', { reason, error: result.error });
        }
        return;
      }
      setTokens(result.data.tokens || []);
      setLastRefresh(new Date().toISOString());
      setTokensLoading(false);
      if (debugTokens) {
        console.debug('[tokens] fetch:success', {
          reason,
          count: result.data.tokens?.length || 0,
          meta: result.data.meta || {}
        });
      }
    },
    [canReadTokens, debugTokens]
  );

  useEffect(() => {
    loadWallets().catch(() => undefined);
  }, [loadWallets]);

  useEffect(() => {
    loadTokens('load').catch(() => undefined);
  }, [loadTokens]);

  const refreshTokens = async () => {
    await loadTokens('refresh');
  };

  const forceReload = () => {
    if (debugTokens) {
      console.debug('[tokens] force-reload');
    }
    window.location.reload();
  };

  const walletOptions = useMemo(
    () =>
      wallets.map((wallet) => ({
        value: wallet.id,
        label: `${wallet.label} (${wallet.chainId})`
      })),
    [wallets]
  );

  const filteredTokens = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return tokens.filter((token) => {
      if (filters.chainId !== 'all' && token.chainId !== filters.chainId) return false;
      if (filters.type !== 'all' && token.type !== filters.type) return false;
      if (filters.walletId !== 'all' && token.walletId !== filters.walletId) return false;
      if (!query) return true;
      const walletLabel = token.wallet?.label || '';
      return [
        token.symbol,
        token.name,
        token.address,
        token.walletId || '',
        walletLabel
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [filters, tokens]);

  const summary = useMemo(() => {
    const walletCount = new Set(tokens.map((token) => token.walletId).filter(Boolean)).size;
    return { total: tokens.length, filtered: filteredTokens.length, walletCount };
  }, [filteredTokens.length, tokens]);

  const onWalletSelect = (walletId: string) => {
    const wallet = wallets.find((entry) => entry.id === walletId);
    setImportForm((prev) => ({
      ...prev,
      walletId,
      chainId:
        wallet?.chainId === 'l1' || wallet?.chainId === 'l2' || wallet?.chainId === 'l3'
          ? wallet.chainId
          : prev.chainId
    }));
  };

  const importToken = async () => {
    if (!importForm.walletId || !importForm.address) {
      setStatus('Wallet + token address required');
      return;
    }
    setStatus('Importing token...');
    const payload = {
      address: importForm.address.trim(),
      chainId: importForm.chainId,
      type: importForm.type,
      rpc: importForm.rpc || undefined
    };
    const result = await apiRequest<TokenWithWallet>(`/wallets/${importForm.walletId}/tokens/import`, {
      init: {
        method: 'POST',
        headers: jsonWithCsrf(),
        body: JSON.stringify(payload)
      }
    });
    if (!result.ok) {
      setStatus(result.error.message || 'Token import failed');
      return;
    }
    setStatus('Token imported');
    setImportForm((prev) => ({ ...prev, address: '' }));
    await loadTokens('refresh');
  };

  const deleteToken = async (token: TokenWithWallet) => {
    if (!token.walletId) {
      setStatus('Token is missing wallet reference');
      return;
    }
    setStatus('Removing token...');
    const result = await apiRequest<{ ok?: boolean }>(`/wallets/${token.walletId}/tokens/${token.id}`, {
      init: { method: 'DELETE', headers: withCsrf() }
    });
    if (!result.ok) {
      setStatus(result.error.message || 'Token removal failed');
      return;
    }
    setStatus('Token removed');
    await loadTokens('refresh');
  };

  return (
    <div className="content">
      <div className="card-grid">
        <Card title="Token registry" subtitle="Wallet-scoped token inventory with live sync">
          <div className="stack">
            <div className="spread">
              <div>
                <div className="muted">Last refresh</div>
                <div>{lastRefresh || '—'}</div>
                <div className="muted">
                  {summary.filtered} shown / {summary.total} total · {summary.walletCount} wallets
                </div>
              </div>
              <div className="row">
                <Button variant="secondary" onClick={refreshTokens} disabled={!canReadTokens || tokensLoading}>
                  Refresh
                </Button>
                <Button variant="secondary" onClick={forceReload}>
                  Force reload
                </Button>
              </div>
            </div>
            <div className="grid">
              <div className="stack">
                <span className="muted">Search</span>
                <input
                  className="input"
                  placeholder="Symbol, address, wallet"
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                />
              </div>
              <div className="stack">
                <span className="muted">Chain</span>
                <select
                  className="select"
                  value={filters.chainId}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, chainId: e.target.value as TokenFilters['chainId'] }))
                  }
                >
                  <option value="all">All chains</option>
                  <option value="l1">GhostChain L1</option>
                  <option value="l2">GhostL2</option>
                  <option value="l3">GhostL3</option>
                </select>
              </div>
              <div className="stack">
                <span className="muted">Type</span>
                <select
                  className="select"
                  value={filters.type}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, type: e.target.value as TokenFilters['type'] }))
                  }
                >
                  <option value="all">All types</option>
                  <option value="erc20">ERC-20</option>
                  <option value="erc721">ERC-721</option>
                  <option value="erc1155">ERC-1155</option>
                </select>
              </div>
              <div className="stack">
                <span className="muted">Wallet</span>
                <select
                  className="select"
                  value={filters.walletId}
                  onChange={(e) => setFilters((prev) => ({ ...prev, walletId: e.target.value }))}
                >
                  <option value="all">All wallets</option>
                  {walletOptions.map((wallet) => (
                    <option key={wallet.value} value={wallet.value}>
                      {wallet.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {walletsError && <DataFetchErrorCard title="Wallet list" error={walletsError} />}
            {!canReadTokens && <div className="muted">Your role does not have permission to view tokens.</div>}
            {canReadTokens && tokensError && <DataFetchErrorCard title="Token registry" error={tokensError} />}
            {canReadTokens && tokensLoading && <div className="muted">Loading tokens...</div>}
            {status && <div className="muted">{status}</div>}
            {!tokensLoading && canReadTokens && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Wallet</th>
                    <th>Chain</th>
                    <th>Address</th>
                    <th>Type</th>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Verified</th>
                    <th>Created</th>
                    {canWriteTokens && <th />}
                  </tr>
                </thead>
                <tbody>
                  {filteredTokens.map((token) => (
                    <tr key={token.id}>
                      <td>
                        <div>{token.wallet?.label || token.walletId || '—'}</div>
                        <div className="muted mono">{token.wallet?.address || ''}</div>
                      </td>
                      <td>{token.chainId}</td>
                      <td className="mono">{token.address}</td>
                      <td>{token.type}</td>
                      <td>{token.symbol}</td>
                      <td>{token.name}</td>
                      <td>
                        <Badge tone={token.verified ? 'success' : 'warning'}>
                          {token.verified ? 'verified' : 'unverified'}
                        </Badge>
                      </td>
                      <td>{token.createdAt}</td>
                      {canWriteTokens && (
                        <td>
                          <Button variant="secondary" onClick={() => deleteToken(token)}>
                            Remove
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!filteredTokens.length && (
                    <tr>
                      <td colSpan={canWriteTokens ? 9 : 8} className="muted">
                        No tokens found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </Card>
        {canWriteTokens && (
          <Card title="Import token" subtitle="Attach ERC tokens to a wallet for registry visibility">
            <div className="stack">
              <div className="grid">
                <div className="stack">
                  <span className="muted">Wallet</span>
                  <select className="select" value={importForm.walletId} onChange={(e) => onWalletSelect(e.target.value)}>
                    <option value="">Select wallet</option>
                    {walletOptions.map((wallet) => (
                      <option key={wallet.value} value={wallet.value}>
                        {wallet.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="stack">
                  <span className="muted">Chain</span>
                  <select
                    className="select"
                    value={importForm.chainId}
                    onChange={(e) =>
                      setImportForm((prev) => ({
                        ...prev,
                        chainId: e.target.value as 'l1' | 'l2' | 'l3'
                      }))
                    }
                  >
                    <option value="l1">GhostChain L1</option>
                    <option value="l2">GhostL2</option>
                    <option value="l3">GhostL3</option>
                  </select>
                </div>
                <div className="stack">
                  <span className="muted">Type</span>
                  <select
                    className="select"
                    value={importForm.type}
                    onChange={(e) => setImportForm((prev) => ({ ...prev, type: e.target.value as 'erc20' | 'erc721' | 'erc1155' }))}
                  >
                    <option value="erc20">ERC-20</option>
                    <option value="erc721">ERC-721</option>
                    <option value="erc1155">ERC-1155</option>
                  </select>
                </div>
              </div>
              <div className="grid">
                <div className="stack">
                  <span className="muted">Token address</span>
                  <input
                    className="input"
                    placeholder="0x..."
                    value={importForm.address}
                    onChange={(e) => setImportForm((prev) => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <div className="stack">
                  <span className="muted">RPC override (optional)</span>
                  <input
                    className="input"
                    placeholder="https://rpc..."
                    value={importForm.rpc}
                    onChange={(e) => setImportForm((prev) => ({ ...prev, rpc: e.target.value }))}
                  />
                </div>
              </div>
              <div className="row">
                <Button onClick={importToken} disabled={!importForm.walletId}>
                  Import token
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
