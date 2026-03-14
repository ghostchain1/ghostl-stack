'use client';

import { useState } from 'react';
import { useFeatureFlags } from '../services/FeatureFlagsService';
import { useNetwork } from '../services/NetworkContextService';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { current } = useNetwork();
  const { isEnabled } = useFeatureFlags();

  const actions = [
    { id: 'restart', label: 'Restart node', enabled: isEnabled('ops.restart') },
    { id: 'alerts', label: 'Open alerts', enabled: isEnabled('observability.alerts') },
    { id: 'rotate-keys', label: 'Rotate keys', enabled: isEnabled('security.guardWrites') }
  ];

  return (
    <div>
      <button className="button secondary" type="button" onClick={() => setOpen((v) => !v)}>
        ⌘K
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 16, top: 56, width: 320 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Quick actions {current ? `(${current.label})` : ''}
          </div>
          <div className="stack">
            {actions.map((action) => (
              <div
                key={action.id}
                className="badge"
                style={{ opacity: action.enabled ? 1 : 0.45 }}
                aria-disabled={!action.enabled}
              >
                {action.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
