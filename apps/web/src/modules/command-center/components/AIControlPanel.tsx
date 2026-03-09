'use client';

import { useState } from 'react';

type ActionState = 'idle' | 'pending' | 'ok' | 'error';

type ActionConfig = {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  method: 'POST';
  confirmRequired?: boolean;
};

const ACTIONS: ActionConfig[] = [
  {
    id: 'restart-ghostbrain',
    label: 'Restart GhostBrain',
    description: 'Restart the AI core (port 7900)',
    endpoint: '/api/ai/restart',
    method: 'POST',
    confirmRequired: true,
  },
  {
    id: 'reload-protocol-architect',
    label: 'Reload Protocol Architect',
    description: 'Hot-reload contract generation engine (port 7910)',
    endpoint: '/api/ai/reload?service=protocol-architect',
    method: 'POST',
  },
  {
    id: 'reload-defi-architect',
    label: 'Reload DeFi Architect',
    description: 'Hot-reload DeFi engine (port 7920)',
    endpoint: '/api/ai/reload?service=defi-architect',
    method: 'POST',
  },
  {
    id: 'flush-governance-cache',
    label: 'Flush Governance Cache',
    description: 'Force governance-event-bridge resync from L1',
    endpoint: '/api/ai/flush-cache?target=governance',
    method: 'POST',
    confirmRequired: true,
  },
];

export function AIControlPanel() {
  const [states, setStates] = useState<Record<string, ActionState>>({});

  async function handleAction(action: ActionConfig) {
    if (action.confirmRequired) {
      const confirmed = window.confirm(`Confirm: ${action.label}?`);
      if (!confirmed) return;
    }

    setStates((prev) => ({ ...prev, [action.id]: 'pending' }));
    try {
      const res = await fetch(action.endpoint, { method: action.method });
      setStates((prev) => ({ ...prev, [action.id]: res.ok ? 'ok' : 'error' }));
    } catch {
      setStates((prev) => ({ ...prev, [action.id]: 'error' }));
    }
    // Reset after 3 s
    setTimeout(() => {
      setStates((prev) => ({ ...prev, [action.id]: 'idle' }));
    }, 3_000);
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 700 }}>AI Control Panel</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ACTIONS.map((action) => {
          const state = states[action.id] ?? 'idle';
          return (
            <div
              key={action.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{action.label}</div>
                <div className="muted" style={{ fontSize: 11 }}>{action.description}</div>
              </div>
              <button
                onClick={() => { void handleAction(action); }}
                disabled={state === 'pending'}
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid',
                  cursor: state === 'pending' ? 'wait' : 'pointer',
                  fontWeight: 600,
                  borderColor: state === 'ok' ? '#22c55e' : state === 'error' ? '#ef4444' : '#d1d5db',
                  background:  state === 'ok' ? '#dcfce7' : state === 'error' ? '#fee2e2' : 'transparent',
                  color:       state === 'ok' ? '#166534' : state === 'error' ? '#991b1b' : 'inherit',
                }}
              >
                {state === 'pending' ? '…' : state === 'ok' ? '✓' : state === 'error' ? '✗' : 'Run'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="muted" style={{ fontSize: 11 }}>
        Actions are logged. AI autonomy is advisory-only — human ratification required for on-chain execution.
      </div>
    </div>
  );
}
