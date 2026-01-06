import { RpcEndpointManager } from '../../src/modules/integrations/components/RpcEndpointManager';
import { UsageAnalytics } from '../../src/modules/integrations/components/UsageAnalytics';
import { WebhooksPanel } from '../../src/modules/integrations/components/WebhooksPanel';
import { PartnerIntegrations } from '../../src/modules/integrations/components/PartnerIntegrations';
import { apiFetch } from '../../src/lib/api';
import type { RpcEndpoint, Webhook } from '@ghostchain/types/integrations';

async function loadIntegrations() {
  const endpoints = await apiFetch<RpcEndpoint[]>('/integrations/rpc', { fallback: [] }).catch(() => []);
  const usage = await apiFetch<{ id: string; requests: number; errors: number; p95: number }[]>('/integrations/usage', {
    fallback: []
  }).catch(() => []);
  const hooks = await apiFetch<Webhook[]>('/integrations/webhooks', { fallback: [] }).catch(() => []);
  return { endpoints, usage, hooks };
}

export default async function IntegrationsPage() {
  const { endpoints, usage, hooks } = await loadIntegrations();
  const partners = [{ name: 'Example Indexer', type: 'indexer', status: 'pending' }];
  return (
    <div className="content">
      <div className="card-grid">
        <RpcEndpointManager endpoints={endpoints} />
        <UsageAnalytics stats={usage} />
        <WebhooksPanel hooks={hooks} />
        <PartnerIntegrations partners={partners} />
      </div>
    </div>
  );
}
