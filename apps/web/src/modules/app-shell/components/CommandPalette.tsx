'use client';

import { useState } from 'react';

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button className="button secondary" type="button" onClick={() => setOpen((v) => !v)}>
        ⌘K
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 16, top: 56, width: 320 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Quick actions (stub)
          </div>
          <div className="stack">
            <div className="badge">Restart node</div>
            <div className="badge">Open alerts</div>
            <div className="badge">Rotate keys</div>
          </div>
        </div>
      )}
    </div>
  );
}
