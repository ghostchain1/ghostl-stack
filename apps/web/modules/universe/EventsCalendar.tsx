'use client';

import { useEffect, useState } from 'react';

const UNIVERSE_API = process.env.NEXT_PUBLIC_UNIVERSE_API ?? 'http://localhost:7700';

interface GhostEvent {
  eventId:        string;
  name:           string;
  type:           string;
  worldId:        string;
  hostAddress:    string;
  ticketPriceGST: string;
  maxAttendees:   number;
  attendees:      string[];
  startAt:        number;
  status:         string;
  streamUrl?:     string;
  totalGiftsGST:  string;
}

const TYPE_ICON: Record<string, string> = {
  'concert':              '🎵',
  'live-stream':          '📡',
  'gaming-tournament':    '🎮',
  'virtual-conference':   '💼',
  'nft-drop':             '💎',
};

const UNIT = 10n ** 18n;

function formatGST(wei: string): string {
  try { return (BigInt(wei) / UNIT).toLocaleString() + ' GST'; }
  catch { return wei; }
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function EventsCalendar() {
  const [upcoming, setUpcoming] = useState<GhostEvent[]>([]);
  const [live,     setLive]     = useState<GhostEvent[]>([]);
  const [avatarId, setAvatarId] = useState('');
  const [buyer,    setBuyer]    = useState('');
  const [status,   setStatus]   = useState('');

  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, []);

  async function load() {
    const [up, lv] = await Promise.all([
      fetch(`${UNIVERSE_API}/events`).then(r => r.json()),
      fetch(`${UNIVERSE_API}/events/live`).then(r => r.json()),
    ]);
    setUpcoming((up as { events: GhostEvent[] }).events);
    setLive((lv as { events: GhostEvent[] }).events);
  }

  async function joinEvent(eventId: string, ticketPriceGST: string) {
    if (!avatarId) { setStatus('Enter your Avatar ID'); return; }
    const priceWei = BigInt(ticketPriceGST);
    if (priceWei > 0n && !buyer) { setStatus('Enter your GhostChain address for ticketed event'); return; }

    setStatus('Joining…');
    try {
      const res  = await fetch(`${UNIVERSE_API}/events/${eventId}/join`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ avatarId, buyerAddress: buyer || undefined }),
      });
      const data = await res.json() as { ticket?: unknown; error?: string };
      setStatus(data.error ? data.error : 'Joined event ✓');
      load();
    } catch { setStatus('Failed to join'); }
  }

  return (
    <div style={{ fontFamily: 'monospace', color: '#e0e0e0' }}>
      <h2>Ghost Universe — Events Calendar</h2>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Avatar ID"
          value={avatarId}
          onChange={e => setAvatarId(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Address (for paid events)"
          value={buyer}
          onChange={e => setBuyer(e.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
      </div>

      {status && (
        <p style={{ color: status.includes('✓') ? '#4caf50' : '#ff8a65', marginBottom: 12 }}>{status}</p>
      )}

      {/* Live events */}
      {live.length > 0 && (
        <>
          <h3 style={{ color: '#ff5252', marginBottom: 8 }}>🔴 Live Now</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
            {live.map(ev => <EventCard key={ev.eventId} ev={ev} onJoin={joinEvent} isLive />)}
          </div>
        </>
      )}

      {/* Upcoming events */}
      <h3 style={{ marginBottom: 8 }}>Upcoming Events</h3>
      {upcoming.length === 0 && <p style={{ color: '#666' }}>No upcoming events scheduled.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {upcoming.map(ev => <EventCard key={ev.eventId} ev={ev} onJoin={joinEvent} />)}
      </div>
    </div>
  );
}

function EventCard({
  ev, onJoin, isLive = false,
}: {
  ev:     GhostEvent;
  onJoin: (id: string, price: string) => void;
  isLive?: boolean;
}) {
  return (
    <div style={{
      background:   isLive ? '#2a0a0a' : '#1a1a2a',
      border:       `1px solid ${isLive ? '#ff5252' : '#333'}`,
      borderRadius: 8, padding: 14,
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{TYPE_ICON[ev.type] ?? '🌐'} {ev.name}</div>
      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>
        World: {ev.worldId}<br />
        Host: {ev.hostAddress.slice(0, 10)}…<br />
        Starts: {formatDate(ev.startAt)}<br />
        Attendees: {ev.attendees.length} / {ev.maxAttendees}<br />
        Ticket: {BigInt(ev.ticketPriceGST) === 0n ? 'Free' : formatGST(ev.ticketPriceGST)}<br />
        Gifts received: {formatGST(ev.totalGiftsGST)}
      </div>
      {ev.streamUrl && (
        <div style={{ fontSize: 11, color: '#5a9fd9', marginBottom: 8 }}>
          Stream: {ev.streamUrl}
        </div>
      )}
      <button
        onClick={() => onJoin(ev.eventId, ev.ticketPriceGST)}
        style={{ width: '100%', padding: '6px 0', background: '#5a0fd9', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
      >
        {isLive ? 'Join Live' : 'Join Event'}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding:    '6px 10px',
  background: '#111',
  border:     '1px solid #444',
  color:      '#fff',
  borderRadius: 4,
  fontFamily: 'monospace',
  width:      200,
};
