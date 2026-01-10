import { RpcEndpointManager } from '../../src/modules/integrations/components/RpcEndpointManager';
import { UsageAnalytics } from '../../src/modules/integrations/components/UsageAnalytics';
import { WebhooksPanel } from '../../src/modules/integrations/components/WebhooksPanel';
import { PartnerIntegrations } from '../../src/modules/integrations/components/PartnerIntegrations';
import { apiFetch } from '../../src/lib/api';
import type { RpcEndpoint, Webhook, IntegrationPartner } from '@ghostl/types/integrations';

async function loadIntegrations() {
  const endpoints = await apiFetch<RpcEndpoint[]>('/integrations/rpc', { fallback: [] }).catch(() => []);
  const usage = await apiFetch<{ id: string; requests: number; errors: number; p95: number }[]>('/integrations/usage', {
    fallback: []
  }).catch(() => []);
  const hooks = await apiFetch<Webhook[]>('/integrations/webhooks', { fallback: [] }).catch(() => []);
  const partners = await apiFetch<{ partners: IntegrationPartner[] }>('/integrations/partners', { fallback: { partners: [] } })
    .then((r) => r.partners || [])
    .catch(() => []);
  return { endpoints, usage, hooks, partners };
}

export default async function IntegrationsPage() {
  const { endpoints, usage, hooks, partners } = await loadIntegrations();
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
