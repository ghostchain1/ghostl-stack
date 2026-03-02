import Link from 'next/link';

export default function EmployeeNotFound() {
  return (
    <div className="content" style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 80 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '3.5rem', fontWeight: 800, color: 'rgba(0,240,181,0.15)', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 16 }}>404</div>
      <h2 style={{ margin: '0 0 10px', fontWeight: 700 }}>Page not found</h2>
      <p className="muted" style={{ marginBottom: 32, maxWidth: 360, marginInline: 'auto' }}>
        This page doesn&apos;t exist in your employee portal.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/incidents" className="chip" style={{ textDecoration: 'none', padding: '8px 20px', background: 'rgba(0,240,181,0.08)', border: '1px solid rgba(0,240,181,0.2)', color: '#00F0B5', borderRadius: 8, cursor: 'pointer' }}>
          ← Incidents
        </Link>
        <Link href="/support"    className="chip" style={{ textDecoration: 'none', cursor: 'pointer' }}>Support</Link>
        <Link href="/monitoring" className="chip" style={{ textDecoration: 'none', cursor: 'pointer' }}>Monitoring</Link>
      </div>
    </div>
  );
}
