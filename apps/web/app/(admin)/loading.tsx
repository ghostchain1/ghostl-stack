export default function RealmLoading() {
  return (
    <div className="content" aria-busy="true" aria-label="Loading…">
      <div style={{ height: 32, width: '26%', borderRadius: 8, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.6s ease-in-out infinite', marginBottom: 24 }} />
      <div style={{ height: 14, width: '42%', borderRadius: 6, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.6s ease-in-out infinite', marginBottom: 32 }} />
      <div className="card-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            padding: '20px',
            animationDelay: `${i * 60}ms`,
            animation: 'pulse 1.6s ease-in-out infinite',
          }}>
            <div style={{ height: 12, width: '55%', background: 'rgba(255,255,255,0.07)', borderRadius: 6, marginBottom: 14 }} />
            <div style={{ height: 24, width: '35%', background: 'rgba(122,92,255,0.18)', borderRadius: 6, marginBottom: 12 }} />
            <div style={{ height: 10, width: '75%', background: 'rgba(255,255,255,0.05)', borderRadius: 5 }} />
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
