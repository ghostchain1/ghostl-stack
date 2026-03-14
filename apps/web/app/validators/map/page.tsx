import { ValidatorWorldMap } from '../../../src/modules/validators/components/ValidatorWorldMap';

export default function ValidatorMapPage() {
  return (
    <div className="content">
      <div style={{ paddingBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Validator Map</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-muted, #9ca3af)' }}>
          Geographic distribution of GhostChain validators worldwide
        </p>
      </div>
      <ValidatorWorldMap />
    </div>
  );
}
