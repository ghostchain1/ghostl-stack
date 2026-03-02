export default function RealmLoading() {
  return (
    <div className="content" aria-busy="true" aria-label="Loading…">
      {/* Page title skeleton */}
      <div style={{ height: 32, width: '28%', borderRadius: 8, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.6s ease-in-out infinite', marginBottom: 24 }} />
      <div style={{ height: 14, width: '45%', borderRadius: 6, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.6s ease-in-out infinite', marginBottom: 32 }} />

      {/* Card grid skeleton */}
      <div className="card-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            padding: '20px',
            animationDelay: `${i * 80}ms`,
            animation: 'pulse 1.6s ease-in-out infinite',
          }}>
            <div style={{ height: 12, width: '60%', background: 'rgba(255,255,255,0.07)', borderRadius: 6, marginBottom: 14 }} />
            <div style={{ height: 28, width: '40%', background: 'rgba(255,255,255,0.1)', borderRadius: 6, marginBottom: 12 }} />
            <div style={{ height: 10, width: '80%', background: 'rgba(255,255,255,0.05)', borderRadius: 5, marginBottom: 8 }} />
            <div style={{ height: 10, width: '65%', background: 'rgba(255,255,255,0.05)', borderRadius: 5 }} />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
