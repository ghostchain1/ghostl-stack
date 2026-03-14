import { GhostBrainConsole } from '../../../src/modules/ai/components/GhostBrainConsole';

export default function AIConsolePage() {
  return (
    <div className="content">
      <div style={{ paddingBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>GhostBrain Console</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-muted, #9ca3af)' }}>
          Structured AI query interface · Write actions require governance ratification
        </p>
      </div>
      <GhostBrainConsole />
    </div>
  );
}
