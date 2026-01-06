'use client';

import type { SlashEvent, Validator } from '@ghostl/types/validators';

export function ValidatorDetailCard({
  validator,
  missedBlocks,
  rewards,
  slashes
}: {
  validator: Validator;
  missedBlocks?: number;
  rewards?: string;
  slashes: SlashEvent[];
}) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800 }}>{validator.id}</div>
          <div className="muted">{validator.address}</div>
        </div>
        <div className={`badge ${validator.status === 'active' ? 'ok' : validator.status === 'jailed' ? 'warn' : 'bad'}`}>
          {validator.status}
        </div>
      </div>
      <div className="pill" style={{ marginTop: 8 }}>
        Stake {validator.stake} · Commission {validator.commission}% · Power {validator.power}
      </div>
      <div className="pill">Missed blocks: {missedBlocks ?? '?'}</div>
      <div className="pill">Rewards: {rewards ?? '?'}</div>
      <div className="stack" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 700 }}>Slash events</div>
        {slashes.map((s) => (
          <div key={s.time + s.reason} className="row" style={{ justifyContent: 'space-between' }}>
            <div className="muted">{s.reason}</div>
            <div className="badge">{s.amount}</div>
          </div>
        ))}
        {!slashes.length && <div className="muted">No slashing recorded.</div>}
      </div>
    </div>
  );
}
