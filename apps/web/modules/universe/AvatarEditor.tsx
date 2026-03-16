'use client';

import { useState } from 'react';

const UNIVERSE_API = process.env.NEXT_PUBLIC_UNIVERSE_API ?? 'http://localhost:7700';

interface AvatarResult {
  avatarId:  string;
  userAddress: string;
  model:     { uri: string; format: string };
  level:     number;
  xp:        number;
  spawnedAt: number;
}

const SKIN_PRESETS = [
  { label: 'Ghost Phantom',  uri: 'ghost://skins/phantom.vrm' },
  { label: 'Neon Rider',    uri: 'ghost://skins/neon-rider.vrm' },
  { label: 'Chain Knight',  uri: 'ghost://skins/chain-knight.vrm' },
  { label: 'Void Dancer',   uri: 'ghost://skins/void-dancer.vrm' },
];

export function AvatarEditor() {
  const [address,  setAddress]  = useState('');
  const [modelUri, setModelUri] = useState('ghost://avatars/default.ghost3d');
  const [format,   setFormat]   = useState<'vrm' | 'glb' | 'ghost3d'>('ghost3d');
  const [avatar,   setAvatar]   = useState<AvatarResult | null>(null);
  const [status,   setStatus]   = useState('');

  async function handleCreate() {
    if (!address) { setStatus('Enter your GhostChain address'); return; }
    setStatus('Creating…');
    try {
      const res  = await fetch(`${UNIVERSE_API}/avatars`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userAddress: address, modelUri, format }),
      });
      const data = await res.json() as { avatarId?: string; error?: string } & Partial<AvatarResult>;
      if (data.avatarId) {
        setAvatar(data as AvatarResult);
        setStatus('Avatar created ✓');
      } else {
        setStatus(data.error ?? 'Failed');
      }
    } catch {
      setStatus('Request failed');
    }
  }

  async function applySkin(skinUri: string) {
    if (!avatar) return;
    // apply skin via move/patch doesn't have a dedicated endpoint; demonstrate gesture instead
    setStatus(`Skin '${skinUri}' selected (apply via GhostWallet NFT)`);
  }

  async function triggerGesture(gestureId: string) {
    if (!avatar) { setStatus('Create avatar first'); return; }
    await fetch(`${UNIVERSE_API}/avatars/${avatar.avatarId}/gesture`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ gestureId, worldId: 'devnet' }),
    });
    setStatus(`Gesture '${gestureId}' triggered`);
  }

  return (
    <div style={{ fontFamily: 'monospace', color: '#e0e0e0' }}>
      <h2>GhostAvatar Editor</h2>

      {/* Creation form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400, marginBottom: 20 }}>
        <label>
          GhostChain Address
          <input
            value={address} onChange={e => setAddress(e.target.value)}
            placeholder="0x…"
            style={inputStyle}
          />
        </label>
        <label>
          Model URI
          <input
            value={modelUri} onChange={e => setModelUri(e.target.value)}
            placeholder="ghost://avatars/…"
            style={inputStyle}
          />
        </label>
        <label>
          Format
          <select value={format} onChange={e => setFormat(e.target.value as never)} style={inputStyle}>
            <option value="ghost3d">ghost3d (native)</option>
            <option value="vrm">VRM</option>
            <option value="glb">GLB</option>
          </select>
        </label>
        <button onClick={handleCreate} style={btnStyle}>Create Avatar</button>
      </div>

      {status && (
        <p style={{ color: status.includes('✓') ? '#4caf50' : '#ff8a65', marginBottom: 12 }}>{status}</p>
      )}

      {/* Avatar card */}
      {avatar && (
        <div style={{ background: '#1a1a2a', border: '1px solid #333', borderRadius: 8, padding: 16, maxWidth: 400 }}>
          <h3 style={{ margin: '0 0 8px' }}>Avatar — {avatar.avatarId.slice(0, 18)}…</h3>
          <p style={{ color: '#aaa', margin: '0 0 4px' }}>Owner: {avatar.userAddress.slice(0, 12)}…</p>
          <p style={{ color: '#aaa', margin: '0 0 4px' }}>Model: {avatar.model.uri}</p>
          <p style={{ color: '#e0e0e0', margin: '0 0 12px' }}>
            Level {avatar.level} · {avatar.xp} XP
          </p>

          {/* Skin presets */}
          <h4 style={{ margin: '0 0 8px' }}>NFT Skin Presets</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {SKIN_PRESETS.map(s => (
              <button key={s.uri} onClick={() => applySkin(s.uri)} style={{ ...btnStyle, fontSize: 11 }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Gestures */}
          <h4 style={{ margin: '0 0 8px' }}>Gestures</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['wave', 'dance-1', 'clap', 'bow', 'heart', 'thumbs-up'].map(g => (
              <button key={g} onClick={() => triggerGesture(g)} style={{ ...btnStyle, fontSize: 11 }}>
                {g}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display:      'block',
  width:        '100%',
  marginTop:    4,
  padding:      '6px 10px',
  background:   '#111',
  border:       '1px solid #444',
  color:        '#fff',
  borderRadius: 4,
  fontFamily:   'monospace',
};

const btnStyle: React.CSSProperties = {
  padding:      '6px 14px',
  background:   '#5a0fd9',
  color:        '#fff',
  border:       'none',
  borderRadius: 4,
  cursor:       'pointer',
};
