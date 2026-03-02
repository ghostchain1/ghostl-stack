import Link from 'next/link';

export default function AdminNotFound() {
  return (
    <div className="content" style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 80 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '3.5rem', fontWeight: 800, color: 'rgba(122,92,255,0.18)', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 16 }}>404</div>
      <h2 style={{ margin: '0 0 10px', fontWeight: 700 }}>Page not found</h2>
      <p className="muted" style={{ marginBottom: 32, maxWidth: 360, marginInline: 'auto' }}>
        This route doesn&apos;t exist in the admin realm.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/command-hub" className="chip" style={{ textDecoration: 'none', padding: '8px 20px', background: 'rgba(122,92,255,0.1)', border: '1px solid rgba(122,92,255,0.25)', color: '#7A5CFF', borderRadius: 8, cursor: 'pointer' }}>
          ← Command Hub
        </Link>
        <Link href="/governance" className="chip" style={{ textDecoration: 'none', cursor: 'pointer' }}>Governance</Link>
        <Link href="/chain"      className="chip" style={{ textDecoration: 'none', cursor: 'pointer' }}>Chain</Link>
      </div>
    </div>
  );
}
