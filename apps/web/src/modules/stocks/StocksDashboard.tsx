'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import { jsonWithCsrf } from '../../lib/csrf';
import { resolveApiBase } from '../../lib/runtime';
import { normalizeRole, roleOrder } from '../identity-access/access-policy';
import { useSession } from '../identity-access/session';
import { fetchStocks, type MarketToken, type MarketTokenInput, type StocksResponse } from './services';

const API_URL = resolveApiBase();

type TokenDraft = MarketTokenInput & { key: string };

type Forecast = { metric?: string; horizon?: string; value?: number; confidence?: number };

type Anomaly = { id?: string; score?: number; reasons?: string[] };

type Explanation = { id?: string; metric?: string; value?: string; reasons?: string[] };

type Recommendation = { id: string; title: string; action: 'hold' | 'reduce' | 'increase'; confidence: number; rationale: string[] };

const chainLabel = (chainId?: string) => {
  if (!chainId) return 'unknown';
  if (chainId.toLowerCase() === 'l1') return 'GhostChain L1';
  if (chainId.toLowerCase() === 'l2') return 'Ghost L2';
  if (chainId.toLowerCase() === 'l3') return 'Ghost L3';
  return chainId;
};

const toneForChange = (change?: string) => {
  if (!change) return 'default' as const;
  const value = Number(change);
  if (Number.isNaN(value)) return 'default' as const;
  if (value > 0) return 'success' as const;
  if (value < 0) return 'critical' as const;
  return 'default' as const;
};

const toneForAction = (action?: string) => {
  if (action === 'increase') return 'success' as const;
  if (action === 'reduce') return 'critical' as const;
  return 'default' as const;
};

const createDraft = (token?: MarketToken): TokenDraft => ({
  key: token?.id || `token-${Math.random().toString(16).slice(2, 8)}`,
  symbol: token?.symbol || '',
  chainId: token?.chainId || 'l2',
  name: token?.name,
  priceUsd: token?.priceUsd,
  change24h: token?.change24h,
  marketCapUsd: token?.marketCapUsd,
  treasuryHoldings: token?.treasuryHoldings
});

export function StocksDashboard() {
  const { user } = useSession();
  const role = normalizeRole(user?.role);
  const isAdmin = roleOrder[role] >= roleOrder.ADMIN;
  const [data, setData] = useState<StocksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [tokenDrafts, setTokenDrafts] = useState<TokenDraft[]>([]);

  const load = async () => {
    setLoading(true);
    const res = await fetchStocks();
    if (res.ok) {
      setData(res.data);
      setStatus('');
    } else {
      setStatus(res.error.message || 'Failed to load market data');
    }
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!data?.tokens) return;
    setTokenDrafts(data.tokens.map((token) => createDraft(token)));
  }, [data?.tokens]);

  const summary = useMemo(() => {
    const tokens = data?.tokens || [];
    return {
      tokens,
      treasury: data?.treasury?.balance || '0',
      forecasts: (data?.forecasts || []) as Forecast[],
      anomalies: (data?.anomalies || []) as Anomaly[],
      explanations: (data?.explanations || []) as Explanation[],
      recommendations: (data?.recommendations || []) as Recommendation[],
      updatedAt: data?.updatedAt || ''
    };
  }, [data]);

  const updateDraft = (key: string, patch: Partial<TokenDraft>) => {
    setTokenDrafts((prev) => prev.map((token) => (token.key === key ? { ...token, ...patch } : token)));
  };

  const addDraft = () => {
    setTokenDrafts((prev) => [...prev, createDraft()]);
  };

  const removeDraft = (key: string) => {
    setTokenDrafts((prev) => prev.filter((token) => token.key !== key));
  };

  const saveTokens = async () => {
    setStatus('Saving tokens...');
    const payload = tokenDrafts
      .map(({ key: _key, ...token }) => token)
      .filter((token) => token.symbol && token.chainId);
    if (!payload.length) {
      setStatus('Add at least one token with symbol and chain');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/stocks/tokens`, {
        method: 'POST',
        headers: jsonWithCsrf(),
        credentials: 'include',
        body: JSON.stringify({ tokens: payload })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setStatus('Tokens saved');
      setData((prev) => (prev ? { ...prev, tokens: json.tokens || prev.tokens } : prev));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <div className="content">
      <div className="card-grid">
        <Card title="Treasury balance" subtitle="On-chain holdings">
          <div className="stack" style={{ gap: 6 }}>
            <div className="metric">
              <span className="metric-label">Balance</span>
              <span className="metric-value">{summary.treasury}</span>
            </div>
            <div className="muted">Last update {summary.updatedAt || 'n/a'}</div>
          </div>
        </Card>
        <Card title="Forecast signals" subtitle="AI predictive metrics">
          <div className="stack" style={{ gap: 6 }}>
            {summary.forecasts.map((forecast, idx) => (
              <div key={`${forecast.metric}-${idx}`} className="spread">
                <span className="muted">{forecast.metric || 'metric'}</span>
                <span>
                  {forecast.value ?? 'n/a'} {forecast.horizon ? `@ ${forecast.horizon}` : ''}
                </span>
              </div>
            ))}
            {!summary.forecasts.length && <div className="muted">No forecasts yet.</div>}
          </div>
        </Card>
        <Card title="Anomaly watch" subtitle="Risk and compliance signals">
          <div className="stack" style={{ gap: 6 }}>
            {summary.anomalies.map((anomaly, idx) => (
              <div key={`${anomaly.id}-${idx}`} className="stack" style={{ gap: 4 }}>
                <div className="spread">
                  <span className="muted">{anomaly.id || 'signal'}</span>
                  <Badge tone={(anomaly.score || 0) > 0.7 ? 'critical' : 'warning'}>
                    {(anomaly.score ?? 0).toFixed(2)}
                  </Badge>
                </div>
                {anomaly.reasons?.length ? (
                  <div className="muted">{anomaly.reasons.join(' · ')}</div>
                ) : (
                  <div className="muted">No anomaly details.</div>
                )}
              </div>
            ))}
            {!summary.anomalies.length && <div className="muted">No anomalies detected.</div>}
          </div>
        </Card>
        <Card title="AI recommendations" subtitle="Treasury and market actions">
          <div className="stack" style={{ gap: 8 }}>
            {summary.recommendations.map((rec) => (
              <div key={rec.id} className="stack" style={{ gap: 4 }}>
                <div className="spread">
                  <span>{rec.title}</span>
                  <Badge tone={toneForAction(rec.action)}>{rec.action}</Badge>
                </div>
                <div className="muted">Confidence {(rec.confidence * 100).toFixed(0)}%</div>
                <div className="muted">{rec.rationale.join(' · ')}</div>
              </div>
            ))}
            {!summary.recommendations.length && <div className="muted">No recommendations yet.</div>}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Market tokens" subtitle="Multi-layer token registry and market data" className="stack">
        <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <div className="muted">{summary.tokens.length} tracked assets</div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="secondary" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
        {status && <div className="muted" style={{ marginTop: 6 }}>{status}</div>}
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Chain</th>
                <th>Price (USD)</th>
                <th>24h</th>
                <th>Market Cap</th>
                <th>Supply</th>
                <th>Treasury</th>
              </tr>
            </thead>
            <tbody>
              {summary.tokens.map((token) => (
                <tr key={token.id}>
                  <td>
                    <div className="stack" style={{ gap: 2 }}>
                      <strong>{token.symbol}</strong>
                      <span className="muted">{token.name || '—'}</span>
                    </div>
                  </td>
                  <td>{chainLabel(token.chainId)}</td>
                  <td>{token.priceUsd || '—'}</td>
                  <td>
                    <Badge tone={toneForChange(token.change24h)}>{token.change24h || '—'}</Badge>
                  </td>
                  <td>{token.marketCapUsd || '—'}</td>
                  <td>{token.supply || '—'}</td>
                  <td>{token.treasuryHoldings || '—'}</td>
                </tr>
              ))}
              {!summary.tokens.length && (
                <tr>
                  <td colSpan={7} className="muted">
                    No market tokens configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </Card>
      </div>

      {isAdmin && (
        <div style={{ marginTop: 16 }}>
          <Card title="Manage market tokens" subtitle="Admin-only registry overrides" className="stack">
          <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
            <div className="muted">Edit token metadata and treasury overlays</div>
            <div className="row" style={{ gap: 8 }}>
              <Button variant="secondary" onClick={addDraft}>
                Add token
              </Button>
              <Button onClick={saveTokens}>Save</Button>
            </div>
          </div>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Chain</th>
                  <th>Name</th>
                  <th>Price</th>
                  <th>24h</th>
                  <th>Market Cap</th>
                  <th>Treasury</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tokenDrafts.map((token) => (
                  <tr key={token.key}>
                    <td>
                      <input
                        className="input"
                        value={token.symbol}
                        onChange={(e) => updateDraft(token.key, { symbol: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="select"
                        value={token.chainId}
                        onChange={(e) => updateDraft(token.key, { chainId: e.target.value })}
                      >
                        <option value="l1">L1</option>
                        <option value="l2">L2</option>
                        <option value="l3">L3</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="input"
                        value={token.name || ''}
                        onChange={(e) => updateDraft(token.key, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={token.priceUsd || ''}
                        onChange={(e) => updateDraft(token.key, { priceUsd: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={token.change24h || ''}
                        onChange={(e) => updateDraft(token.key, { change24h: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={token.marketCapUsd || ''}
                        onChange={(e) => updateDraft(token.key, { marketCapUsd: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        value={token.treasuryHoldings || ''}
                        onChange={(e) => updateDraft(token.key, { treasuryHoldings: e.target.value })}
                      />
                    </td>
                    <td>
                      <Button variant="secondary" onClick={() => removeDraft(token.key)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
                {!tokenDrafts.length && (
                  <tr>
                    <td colSpan={8} className="muted">
                      No token overrides. Add one to seed the registry.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </Card>
        </div>
      )}
    </div>
  );
}
