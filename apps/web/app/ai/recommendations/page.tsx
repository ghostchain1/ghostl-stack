import { AIRecommendationsPanel } from '../../../src/modules/ai/components/AIRecommendationsPanel';

export const metadata = {
  title: 'AI Recommendations',
  description: 'GhostBrain AI-drafted actions awaiting human ratification.',
};

export default function AIRecommendationsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>AI Recommendations</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--color-muted, #9ca3af)' }}>
          GhostBrain Core drafts these actions autonomously. Each must be ratified by a human
          operator before execution. Approved actions are queued to the signing relay at{' '}
          <code>http://localhost:7910</code> — no direct on-chain calls from the browser.
        </p>
      </div>
      <AIRecommendationsPanel maxShown={20} />
    </div>
  );
}
