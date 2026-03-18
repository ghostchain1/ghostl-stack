'use client';

/**
 * app/settings/page.tsx — GhostStack Settings.
 *
 * Runtime configuration for the web console: theme, API endpoints, WS gateway,
 * feature flags, session info.  All values persist in localStorage only —
 * no server state is mutated from this page.
 */

import { useEffect, useState } from 'react';
import { useRealtime } from '../../lib/ws';

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeLocalGet(key: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return localStorage.getItem(key) ?? fallback;
}
function safeLocalSet(key: string, value: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, value);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label:       string;
  description?: string;
  children:    React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 20,
      padding: '14px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{label}</div>
        {description && (
          <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 3 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: 260,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        color: 'var(--text)',
        padding: '6px 12px',
        fontSize: '0.85rem',
        fontFamily: 'var(--font-display)',
      }}
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        cursor: 'pointer',
        background: checked ? 'var(--accent)' : 'var(--border)',
        position: 'relative',
        transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: checked ? 22 : 3,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
        display: 'block',
      }} />
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { connected, serverTime, gatewayClients } = useRealtime();

  // API / network config
  const [apiUrl, setApiUrl]     = useState('');
  const [wsUrl, setWsUrl]       = useState('');
  const [l1Rpc, setL1Rpc]       = useState('');
  const [l2Rpc, setL2Rpc]       = useState('');
  const [l3Rpc, setL3Rpc]       = useState('');

  // UI flags
  const [darkMode, setDarkMode]           = useState(true);
  const [compactSidebar, setCompactSidebar] = useState(false);
  const [showTestnets, setShowTestnets]   = useState(false);
  const [devMode, setDevMode]             = useState(false);
  const [saved, setSaved]                 = useState(false);

  useEffect(() => {
    setApiUrl(safeLocalGet('GHOST_API_URL',  process.env.NEXT_PUBLIC_API_URL  ?? 'http://localhost:4000'));
    setWsUrl( safeLocalGet('GHOST_WS_URL',   process.env.NEXT_PUBLIC_WS_GATEWAY_URL ?? 'ws://localhost:8085'));
    setL1Rpc( safeLocalGet('GHOST_L1_RPC',   'http://localhost:18545'));
    setL2Rpc( safeLocalGet('GHOST_L2_RPC',   'http://localhost:29547'));
    setL3Rpc( safeLocalGet('GHOST_L3_RPC',   'http://localhost:39545'));
    setDarkMode(      safeLocalGet('GHOST_DARK',        'true')  === 'true');
    setCompactSidebar(safeLocalGet('GHOST_COMPACT',     'false') === 'true');
    setShowTestnets(  safeLocalGet('GHOST_TESTNETS',    'false') === 'true');
    setDevMode(       safeLocalGet('GHOST_DEV',         'false') === 'true');
  }, []);

  const save = () => {
    safeLocalSet('GHOST_API_URL',  apiUrl);
    safeLocalSet('GHOST_WS_URL',   wsUrl);
    safeLocalSet('GHOST_L1_RPC',   l1Rpc);
    safeLocalSet('GHOST_L2_RPC',   l2Rpc);
    safeLocalSet('GHOST_L3_RPC',   l3Rpc);
    safeLocalSet('GHOST_DARK',     String(darkMode));
    safeLocalSet('GHOST_COMPACT',  String(compactSidebar));
    safeLocalSet('GHOST_TESTNETS', String(showTestnets));
    safeLocalSet('GHOST_DEV',      String(devMode));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const reset = () => {
    if (typeof window !== 'undefined') {
      ['GHOST_API_URL','GHOST_WS_URL','GHOST_L1_RPC','GHOST_L2_RPC','GHOST_L3_RPC',
       'GHOST_DARK','GHOST_COMPACT','GHOST_TESTNETS','GHOST_DEV'].forEach((k) => localStorage.removeItem(k));
    }
    window.location.reload();
  };

  return (
    <div className="page-wrap" style={{ maxWidth: 800 }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          Settings
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
          Console preferences and network configuration. Stored in browser localStorage only.
        </p>
      </div>

      {/* WS session info */}
      <div className="cyber-panel cyber-panel--info">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.84rem' }}>
          <div>
            <span style={{ color: 'var(--muted)' }}>WS Gateway: </span>
            <span className={`status-dot ${connected ? 'status-dot--live' : 'status-dot--danger'}`} style={{ marginRight: 6 }} />
            <strong style={{ color: connected ? 'var(--accent)' : 'var(--danger)' }}>
              {connected ? 'Connected' : 'Disconnected'}
            </strong>
          </div>
          {serverTime && (
            <div>
              <span style={{ color: 'var(--muted)' }}>Server time: </span>
              <strong>{new Date(serverTime).toLocaleTimeString()}</strong>
            </div>
          )}
          <div>
            <span style={{ color: 'var(--muted)' }}>Gateway clients: </span>
            <strong>{gatewayClients}</strong>
          </div>
        </div>
      </div>

      {/* API section */}
      <div className="cyber-panel">
        <h2 className="section-title">Network Endpoints</h2>

        <SettingRow
          label="BFF API URL"
          description="Base URL for the Express BFF (apps/api). NEXT_PUBLIC_API_URL at build time."
        >
          <TextInput value={apiUrl} onChange={setApiUrl} placeholder="http://localhost:4000" />
        </SettingRow>

        <SettingRow
          label="WebSocket Gateway URL"
          description="WebSocket URL used for live block/health/AI data. NEXT_PUBLIC_WS_GATEWAY_URL."
        >
          <TextInput value={wsUrl} onChange={setWsUrl} placeholder="ws://localhost:8085" />
        </SettingRow>

        <SettingRow
          label="GhostChain L1 RPC"
          description="Chain ID 14000101 · port 18545"
        >
          <TextInput value={l1Rpc} onChange={setL1Rpc} placeholder="http://localhost:18545" />
        </SettingRow>

        <SettingRow
          label="GhostL2 RPC"
          description="Chain ID 901 · port 29547"
        >
          <TextInput value={l2Rpc} onChange={setL2Rpc} placeholder="http://localhost:29547" />
        </SettingRow>

        <SettingRow
          label="GhostL3 RPC"
          description="Chain ID 903 · port 39545"
        >
          <TextInput value={l3Rpc} onChange={setL3Rpc} placeholder="http://localhost:39545" />
        </SettingRow>
      </div>

      {/* UI section */}
      <div className="cyber-panel">
        <h2 className="section-title">Interface</h2>

        <SettingRow
          label="Dark Mode"
          description="GhostChain dark theme (recommended for operator consoles)."
        >
          <Toggle checked={darkMode} onChange={setDarkMode} />
        </SettingRow>

        <SettingRow
          label="Compact Sidebar"
          description="Collapse sidebar to icon-only mode by default."
        >
          <Toggle checked={compactSidebar} onChange={setCompactSidebar} />
        </SettingRow>

        <SettingRow
          label="Show Testnets"
          description="Display testnet chain connections in the network switcher."
        >
          <Toggle checked={showTestnets} onChange={setShowTestnets} />
        </SettingRow>

        <SettingRow
          label="Developer Mode"
          description="Expose raw JSON payloads, advanced API inspector, and debug overlays."
        >
          <Toggle checked={devMode} onChange={setDevMode} />
        </SettingRow>
      </div>

      {/* Build info */}
      <div className="cyber-panel cyber-panel--info" style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
        <h2 className="section-title" style={{ fontSize: '0.9rem' }}>Build Info</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
          {[
            ['Chain ID (L1)',   '14000101'],
            ['Chain ID (L2)',   '901'],
            ['Chain ID (L3)',   '903'],
            ['Gas Token',      'GST'],
            ['Explorer',       'GhostScan'],
            ['Next.js',        '16.1.6'],
            ['React',          '19.2.4'],
            ['TypeScript',     '5.9.3'],
          ].map(([k, v]) => (
            <div key={k}>
              <span style={{ color: 'var(--muted)' }}>{k}: </span>
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontFamily: 'var(--font-display)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button
          onClick={reset}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Reset to defaults
        </button>
        <button
          onClick={save}
          style={{
            padding: '8px 28px',
            borderRadius: 8,
            border: 'none',
            background: saved ? 'var(--success)' : 'var(--accent)',
            color: '#000',
            cursor: 'pointer',
            fontWeight: 700,
            transition: 'background 0.2s',
          }}
        >
          {saved ? '✓ Saved' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
