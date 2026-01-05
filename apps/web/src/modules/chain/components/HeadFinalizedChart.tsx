'use client';

import type { FC } from 'react';

type Point = { t: number; value: number };

interface Props {
  head: Point[];
  finalized: Point[];
}

const width = 320;
const height = 120;

const normalize = (points: Point[]) => points.filter((p) => Number.isFinite(p.value));

export const HeadFinalizedChart: FC<Props> = ({ head, finalized }) => {
  const headPoints = normalize(head);
  const finalizedPoints = normalize(finalized);
  const all = [...headPoints, ...finalizedPoints];
  if (!all.length) return <div className="muted">No series data</div>;
  const minT = Math.min(...all.map((p) => p.t));
  const maxT = Math.max(...all.map((p) => p.t));
  const minV = Math.min(...all.map((p) => p.value));
  const maxV = Math.max(...all.map((p) => p.value));

  const scaleX = (t: number) => ((t - minT) / (maxT - minT || 1)) * width;
  const scaleY = (v: number) => height - ((v - minV) / (maxV - minV || 1)) * height;

  const toPath = (pts: Point[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.t)} ${scaleY(p.value)}`).join(' ');

  const headCircles = headPoints.slice(-5);
  const finalizedCircles = finalizedPoints.slice(-5);

  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="inline-form" style={{ gap: 12 }}>
        <span className="badge" style={{ background: '#38bdf833' }}>Head</span>
        <span className="badge" style={{ background: '#22c55e33' }}>Finalized</span>
      </div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ background: 'linear-gradient(90deg, rgba(125,211,252,0.06), rgba(124,58,237,0.06))', borderRadius: 8 }}
      >
        <path d={toPath(finalizedPoints)} stroke="#22c55e" strokeWidth={2} fill="none" />
        <path d={toPath(headPoints)} stroke="#38bdf8" strokeWidth={2} fill="none" />
        {finalizedCircles.map((p, i) => (
          <circle key={`f-${i}`} cx={scaleX(p.t)} cy={scaleY(p.value)} r={3} fill="#22c55e" />
        ))}
        {headCircles.map((p, i) => (
          <circle key={`h-${i}`} cx={scaleX(p.t)} cy={scaleY(p.value)} r={3} fill="#38bdf8" />
        ))}
      </svg>
    </div>
  );
};

export default HeadFinalizedChart;
