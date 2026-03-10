'use client';

/**
 * ContractDeployer.tsx — UI for deploying and verifying contracts on L1/L2/L3.
 *
 * Submits to /api/contracts/deploy (BFF) which requires ADMIN role.
 * The BFF validates bytecode length, target chain, and constructor args before
 * forwarding to the appropriate chain RPC via the ghost-api internal service.
 *
 * Security:
 *  - Target chain restricted to L1/L2/L3 chain IDs only
 *  - Bytecode field is server-side validated (must start with 0x, hex only)
 *  - ABI/constructor args are parsed and sanitised on the server
 *  - No shell commands; all deployment is via eth_sendRawTransaction through BFF
 */

import { useState, useRef } from 'react';
import type { FormEvent } from 'react';

type TargetLayer = 'l1' | 'l2' | 'l3';

const LAYER_META: Record<TargetLayer, { label: string; chainId: number }> = {
  l1: { label: 'GhostChain L1', chainId: 14000101 },
  l2: { label: 'GhostL2',       chainId: 901       },
  l3: { label: 'GhostL3',       chainId: 903       },
};

type DeployResult =
  | { ok: true;  txHash: string; contractAddress: string; layer: string }
  | { ok: false; error: string };

export function ContractDeployer() {
  const [layer,        setLayer]        = useState<TargetLayer>('l2');
  const [bytecode,     setBytecode]     = useState('');
  const [constructorArgs, setCtorArgs] = useState('');
  const [valueGst,     setValueGst]    = useState('0');
  const [submitting,   setSubmitting]  = useState(false);
  const [result,       setResult]      = useState<DeployResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/contracts/deploy', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layer,
          bytecode: bytecode.trim(),
          constructorArgs: constructorArgs.trim() || '[]',
          valueGst: valueGst.trim() || '0',
        }),
      });
      const json = await res.json() as DeployResult;
      setResult(json);
      if (json.ok) {
        setBytecode('');
        setCtorArgs('');
        setValueGst('0');
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title">Deploy Contract</div>
      <p className="muted" style={{ fontSize: 11, marginBottom: 16, marginTop: -4 }}>
        Deploys compiled bytecode to the selected GhostChain layer. Requires ADMIN role.
      </p>

      <form ref={formRef} onSubmit={(e) => { void handleSubmit(e); }} className="stack">
        {/* Target layer */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Target Layer
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(Object.keys(LAYER_META) as TargetLayer[]).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLayer(l)}
                className={layer === l ? 'button' : 'button secondary'}
                style={{ flex: 1, fontSize: 12 }}
              >
                {LAYER_META[l].label}
                <span className="muted" style={{ display: 'block', fontSize: 10 }}>
                  Chain {LAYER_META[l].chainId}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Bytecode */}
        <div>
          <label htmlFor="cd-bytecode" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Bytecode (0x-prefixed hex)
          </label>
          <textarea
            id="cd-bytecode"
            value={bytecode}
            onChange={e => setBytecode(e.target.value)}
            placeholder="0x608060..."
            required
            rows={4}
            style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: 11,
              background: 'var(--surface-1, #111827)',
              color: 'inherit',
              border: '1px solid var(--border, #374151)',
              borderRadius: 6,
              padding: '8px 10px',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Constructor args */}
        <div>
          <label htmlFor="cd-args" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Constructor Args (ABI-encoded JSON array — leave empty if none)
          </label>
          <input
            id="cd-args"
            value={constructorArgs}
            onChange={e => setCtorArgs(e.target.value)}
            placeholder='["0xabc...", 1000000]'
            style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: 11,
              background: 'var(--surface-1, #111827)',
              color: 'inherit',
              border: '1px solid var(--border, #374151)',
              borderRadius: 6,
              padding: '8px 10px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Value */}
        <div>
          <label htmlFor="cd-value" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Value (GST) — payable constructors only
          </label>
          <input
            id="cd-value"
            type="text"
            value={valueGst}
            onChange={e => setValueGst(e.target.value)}
            placeholder="0"
            style={{
              width: 160,
              fontFamily: 'monospace',
              fontSize: 12,
              background: 'var(--surface-1, #111827)',
              color: 'inherit',
              border: '1px solid var(--border, #374151)',
              borderRadius: 6,
              padding: '8px 10px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          className="button"
          disabled={submitting || !bytecode.trim()}
          style={{ alignSelf: 'flex-start' }}
        >
          {submitting ? 'Deploying…' : `Deploy to ${LAYER_META[layer].label}`}
        </button>
      </form>

      {/* Result */}
      {result && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            borderRadius: 8,
            background: result.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${result.ok ? '#22c55e40' : '#ef444440'}`,
          }}
        >
          {result.ok ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 6 }}>
                Deployed successfully
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace' }}>
                <div><span className="muted">Contract: </span>{result.contractAddress}</div>
                <div><span className="muted">Tx:       </span>{result.txHash}</div>
                <div><span className="muted">Layer:    </span>{result.layer}</div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#ef4444' }}>{result.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
