'use client';

type Pool = { id: string; chain: string; liquidity: string; fee?: string };

export function LiquidityPools({ pools }: { pools: Pool[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Liquidity pools</div>
      <div className="stack" style={{ gap: 6 }}>
        {pools.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{p.id}</div>
              <div className="muted">{p.chain}</div>
            </div>
            <div className="pill">
              {p.liquidity} {p.fee ? `· fee ${p.fee}` : ''}
            </div>
          </div>
        ))}
        {!pools.length && <div className="muted">No pools.</div>}
      </div>
    </div>
  );
}
