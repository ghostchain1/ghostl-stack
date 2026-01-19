'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import type { AnalyticsEvent, WebhookStatusSummary } from '@ghostl/types';
import type { IntegrationDefinition, IntegrationInstance, IntegrationTestResult } from '@ghostl/types/integrations';
import { resolveApiBase } from '../../lib/runtime';
import { jsonWithCsrf } from '../../lib/csrf';
import { RpcEndpointManager } from './components/RpcEndpointManager';
import type { RpcEndpoint } from '@ghostl/types/integrations';
import { useSession } from '../identity-access/session';

const API_URL = resolveApiBase();

const defaultPolicy = {
  timeoutMs: 3500,
  retries: 2,
  backoffMs: 500,
  rateLimitPerMin: 120,
  circuitBreaker: { enabled: true, failOpen: false }
};

const formatHealth = (status: IntegrationInstance['health']['status']) => {
  if (status === 'OK') return { label: 'OK', tone: 'success' };
  if (status === 'DEGRADED') return { label: 'Degraded', tone: 'warning' };
  return { label: 'Down', tone: 'danger' };
};

const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function IntegrationsControlCenter() {
  const session = useSession();
  const isAdmin = session.user?.role === 'ADMIN';
  const [definitions, setDefinitions] = useState<IntegrationDefinition[]>([]);
  const [instances, setInstances] = useState<IntegrationInstance[]>([]);
  const [rpcEndpoints, setRpcEndpoints] = useState<RpcEndpoint[]>([]);
  const [status, setStatus] = useState<string>('');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatusSummary | null>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<AnalyticsEvent[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>('');
  const [environment, setEnvironment] = useState<IntegrationInstance['environment']>('dev');
  const [enabled, setEnabled] = useState(true);
  const [configInputs, setConfigInputs] = useState<Record<string, string>>({});
  const [policyInputs, setPolicyInputs] = useState({
    timeoutMs: String(defaultPolicy.timeoutMs),
    retries: String(defaultPolicy.retries),
    backoffMs: String(defaultPolicy.backoffMs),
    rateLimitPerMin: String(defaultPolicy.rateLimitPerMin),
    circuitBreakerEnabled: true,
    circuitBreakerFailOpen: false
  });
  const [instanceEdits, setInstanceEdits] = useState<Record<string, Partial<IntegrationInstance>>>({});
  const [instanceConfigs, setInstanceConfigs] = useState<Record<string, Record<string, string>>>({});
  const [testResults, setTestResults] = useState<Record<string, IntegrationTestResult | null>>({});

  const definitionMap = useMemo(
    () => Object.fromEntries(definitions.map((def) => [def.id, def])),
    [definitions]
  );

  const load = async () => {
    setStatus('Loading integrations...');
    try {
      const [defRes, instRes, rpcRes] = await Promise.all([
        fetch(`${API_URL}/integrations/definitions`, { credentials: 'include' }),
        fetch(`${API_URL}/integrations/instances`, { credentials: 'include' }),
        fetch(`${API_URL}/integrations/rpc`, { credentials: 'include' })
      ]);
      if (!defRes.ok || !instRes.ok) throw new Error('auth_required');
      const defJson = (await defRes.json()) as IntegrationDefinition[];
      const instJson = (await instRes.json()) as IntegrationInstance[];
      const rpcJson = rpcRes.ok ? ((await rpcRes.json()) as RpcEndpoint[]) : [];
      setDefinitions(defJson);
      setInstances(instJson);
      setRpcEndpoints(rpcJson);
      setSelectedDefinitionId(defJson[0]?.id || '');
      setStatus('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load integrations';
      setStatus(msg);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const loadActivity = async () => {
      try {
        const [eventsRes, webhookRes, deliveriesRes] = await Promise.all([
          fetch(`${API_URL}/analytics/events?scope=integrations&limit=8`, { credentials: 'include' }),
          fetch(`${API_URL}/webhooks/status`, { credentials: 'include' }),
          fetch(`${API_URL}/webhooks/deliveries?limit=5`, { credentials: 'include' })
        ]);
        if (eventsRes.ok) {
          const data = (await eventsRes.json()) as { events?: AnalyticsEvent[] };
          setEvents(data.events || []);
        }
        if (webhookRes.ok) {
          const data = (await webhookRes.json()) as WebhookStatusSummary;
          setWebhookStatus(data);
        }
        if (deliveriesRes.ok) {
          const data = (await deliveriesRes.json()) as { deliveries?: AnalyticsEvent[] };
          setWebhookDeliveries(data.deliveries || []);
        }
      } catch {
        // ignore
      }
    };
    loadActivity();
  }, [isAdmin]);

  const summarizeEvent = (event: AnalyticsEvent) => {
    const payload = event.payload || {};
    const summaryFields = ['instanceId', 'definitionId', 'environment', 'enabled', 'ok'];
    const details = summaryFields
      .map((field) => (payload as Record<string, unknown>)[field])
      .filter((value) => value !== undefined && value !== null);
    return details.length ? details.join(' · ') : '';
  };

  const createInstance = async () => {
    if (!selectedDefinitionId) {
      setStatus('Select a definition');
      return;
    }
    const definition = definitionMap[selectedDefinitionId];
    if (!definition) {
      setStatus('Invalid definition');
      return;
    }
    const config: Record<string, unknown> = {};
    definition.configFields.forEach((field) => {
      const value = configInputs[field.key];
      if (value !== undefined) config[field.key] = field.type === 'number' ? toNumber(value, 0) : value;
    });
    setStatus('Creating integration...');
    try {
      const res = await fetch(`${API_URL}/integrations/instances`, {
        method: 'POST',
        headers: jsonWithCsrf(),
        credentials: 'include',
        body: JSON.stringify({
          definitionId: selectedDefinitionId,
          environment,
          enabled,
          config,
          policy: {
            timeoutMs: toNumber(policyInputs.timeoutMs, defaultPolicy.timeoutMs),
            retries: toNumber(policyInputs.retries, defaultPolicy.retries),
            backoffMs: toNumber(policyInputs.backoffMs, defaultPolicy.backoffMs),
            rateLimitPerMin: toNumber(policyInputs.rateLimitPerMin, defaultPolicy.rateLimitPerMin),
            circuitBreaker: {
              enabled: policyInputs.circuitBreakerEnabled,
              failOpen: policyInputs.circuitBreakerFailOpen
            }
          }
        })
      });
      if (!res.ok) throw new Error(`Create failed ${res.status}`);
      await load();
      setConfigInputs({});
      setStatus('Integration created');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      setStatus(msg);
    }
  };

  const updateInstance = async (instance: IntegrationInstance) => {
    const edits = instanceEdits[instance.id] || {};
    const configEdits = instanceConfigs[instance.id] || {};
    const hasConfig = Object.values(configEdits).some((value) => value !== '');
    const configPayload = hasConfig
      ? Object.fromEntries(Object.entries(configEdits).filter(([, value]) => value !== ''))
      : undefined;
    setStatus('Updating integration...');
    try {
      const res = await fetch(`${API_URL}/integrations/instances/${instance.id}`, {
        method: 'PATCH',
        headers: jsonWithCsrf(),
        credentials: 'include',
        body: JSON.stringify({
          enabled: edits.enabled ?? instance.enabled,
          environment: edits.environment ?? instance.environment,
          policy: edits.policy ?? instance.policy,
          config: configPayload
        })
      });
      if (!res.ok) throw new Error(`Update failed ${res.status}`);
      await load();
      setStatus('Integration updated');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      setStatus(msg);
    }
  };

  const toggleInstance = async (instance: IntegrationInstance, next: boolean) => {
    setStatus(next ? 'Enabling integration...' : 'Disabling integration...');
    try {
      const res = await fetch(`${API_URL}/integrations/instances/${instance.id}/enable`, {
        method: 'POST',
        headers: jsonWithCsrf(),
        credentials: 'include',
        body: JSON.stringify({ enabled: next })
      });
      if (!res.ok) throw new Error('Toggle failed');
      await load();
      setStatus(next ? 'Integration enabled' : 'Integration disabled');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Toggle failed';
      setStatus(msg);
    }
  };

  const testInstance = async (instance: IntegrationInstance) => {
    setStatus('Testing integration...');
    try {
      const res = await fetch(`${API_URL}/integrations/instances/${instance.id}/test`, {
        method: 'POST',
        headers: jsonWithCsrf(),
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`Test failed ${res.status}`);
      const result = (await res.json()) as IntegrationTestResult;
      setTestResults((prev) => ({ ...prev, [instance.id]: result }));
      await load();
      setStatus(result.ok ? 'Integration OK' : 'Integration failed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test failed';
      setStatus(msg);
    }
  };

  return (
    <div className="content">
      <div className="card-grid">
        <Card title="Integrations Control Center" subtitle="Definitions, instances, policy, and health">
          {status && <div className="muted">{status}</div>}
          {!definitions.length && <div className="muted">No definitions available.</div>}
        </Card>
        <Card title="Create integration instance" subtitle="Register a secure configured instance">
          <label className="muted">Definition</label>
          <select
            className="input"
            value={selectedDefinitionId}
            onChange={(e) => {
              setSelectedDefinitionId(e.target.value);
              setConfigInputs({});
            }}
          >
            {definitions.map((def) => (
              <option key={def.id} value={def.id}>
                {def.name}
              </option>
            ))}
          </select>
          <label className="muted">Environment</label>
          <select className="input" value={environment} onChange={(e) => setEnvironment(e.target.value as IntegrationInstance['environment'])}>
            <option value="local">local</option>
            <option value="dev">dev</option>
            <option value="staging">staging</option>
            <option value="prod">prod</option>
          </select>
          <label className="muted">Enabled</label>
          <select className="input" value={enabled ? 'true' : 'false'} onChange={(e) => setEnabled(e.target.value === 'true')}>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
          {definitionMap[selectedDefinitionId]?.configFields.map((field) => (
            <div key={field.key}>
              <label className="muted">{field.label}</label>
              <input
                className="input"
                type={field.type === 'secret' ? 'password' : 'text'}
                value={configInputs[field.key] || ''}
                onChange={(e) => setConfigInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
            </div>
          ))}
          <label className="muted">Policy</label>
          <div className="grid-2">
            <input
              className="input"
              value={policyInputs.timeoutMs}
              onChange={(e) => setPolicyInputs((prev) => ({ ...prev, timeoutMs: e.target.value }))}
              placeholder="timeoutMs"
            />
            <input
              className="input"
              value={policyInputs.retries}
              onChange={(e) => setPolicyInputs((prev) => ({ ...prev, retries: e.target.value }))}
              placeholder="retries"
            />
            <input
              className="input"
              value={policyInputs.backoffMs}
              onChange={(e) => setPolicyInputs((prev) => ({ ...prev, backoffMs: e.target.value }))}
              placeholder="backoffMs"
            />
            <input
              className="input"
              value={policyInputs.rateLimitPerMin}
              onChange={(e) => setPolicyInputs((prev) => ({ ...prev, rateLimitPerMin: e.target.value }))}
              placeholder="rateLimitPerMin"
            />
          </div>
          <div className="row">
            <label className="muted">Circuit breaker</label>
            <select
              className="input"
              value={policyInputs.circuitBreakerEnabled ? 'enabled' : 'disabled'}
              onChange={(e) => setPolicyInputs((prev) => ({ ...prev, circuitBreakerEnabled: e.target.value === 'enabled' }))}
            >
              <option value="enabled">enabled</option>
              <option value="disabled">disabled</option>
            </select>
            <select
              className="input"
              value={policyInputs.circuitBreakerFailOpen ? 'true' : 'false'}
              onChange={(e) => setPolicyInputs((prev) => ({ ...prev, circuitBreakerFailOpen: e.target.value === 'true' }))}
            >
              <option value="false">fail closed</option>
              <option value="true">fail open</option>
            </select>
          </div>
          <Button onClick={createInstance}>Create instance</Button>
        </Card>
      </div>
      <div className="card-grid">
        {instances.map((instance) => {
          const definition = definitionMap[instance.definitionId];
          const health = formatHealth(instance.health.status);
          const edits = instanceEdits[instance.id] || {};
          const policy = edits.policy || instance.policy;
          const configFields = definition?.configFields || [];
          return (
            <Card
              key={instance.id}
              title={`${definition?.name || instance.definitionId} (${instance.environment})`}
              subtitle={instance.id}
            >
              <div className="row">
                <Badge>{instance.enabled ? 'Enabled' : 'Disabled'}</Badge>
                <Badge>{health.label}</Badge>
              </div>
              <div className="muted">
                Storage: {instance.configRef.kind} • {instance.configRef.ref}
              </div>
              <div className="muted">
                Last checked: {instance.health.lastCheckedAt || 'never'} • Latency:{' '}
                {instance.health.latencyMs ?? 'n/a'} • Error: {instance.health.lastError || 'none'}
              </div>
              <label className="muted">Environment</label>
              <select
                className="input"
                value={edits.environment || instance.environment}
                onChange={(e) =>
                  setInstanceEdits((prev) => ({
                    ...prev,
                    [instance.id]: { ...edits, environment: e.target.value as IntegrationInstance['environment'] }
                  }))
                }
              >
                <option value="local">local</option>
                <option value="dev">dev</option>
                <option value="staging">staging</option>
                <option value="prod">prod</option>
              </select>
              <label className="muted">Policy</label>
              <div className="grid-2">
                <input
                  className="input"
                  value={String(policy.timeoutMs)}
                  onChange={(e) =>
                    setInstanceEdits((prev) => ({
                      ...prev,
                      [instance.id]: {
                        ...edits,
                        policy: { ...policy, timeoutMs: toNumber(e.target.value, policy.timeoutMs) }
                      }
                    }))
                  }
                />
                <input
                  className="input"
                  value={String(policy.retries)}
                  onChange={(e) =>
                    setInstanceEdits((prev) => ({
                      ...prev,
                      [instance.id]: {
                        ...edits,
                        policy: { ...policy, retries: toNumber(e.target.value, policy.retries) }
                      }
                    }))
                  }
                />
                <input
                  className="input"
                  value={String(policy.backoffMs)}
                  onChange={(e) =>
                    setInstanceEdits((prev) => ({
                      ...prev,
                      [instance.id]: {
                        ...edits,
                        policy: { ...policy, backoffMs: toNumber(e.target.value, policy.backoffMs) }
                      }
                    }))
                  }
                />
                <input
                  className="input"
                  value={String(policy.rateLimitPerMin)}
                  onChange={(e) =>
                    setInstanceEdits((prev) => ({
                      ...prev,
                      [instance.id]: {
                        ...edits,
                        policy: { ...policy, rateLimitPerMin: toNumber(e.target.value, policy.rateLimitPerMin) }
                      }
                    }))
                  }
                />
              </div>
              <label className="muted">Circuit breaker</label>
              <div className="row">
                <select
                  className="input"
                  value={policy.circuitBreaker.enabled ? 'enabled' : 'disabled'}
                  onChange={(e) =>
                    setInstanceEdits((prev) => ({
                      ...prev,
                      [instance.id]: {
                        ...edits,
                        policy: {
                          ...policy,
                          circuitBreaker: { ...policy.circuitBreaker, enabled: e.target.value === 'enabled' }
                        }
                      }
                    }))
                  }
                >
                  <option value="enabled">enabled</option>
                  <option value="disabled">disabled</option>
                </select>
                <select
                  className="input"
                  value={policy.circuitBreaker.failOpen ? 'true' : 'false'}
                  onChange={(e) =>
                    setInstanceEdits((prev) => ({
                      ...prev,
                      [instance.id]: {
                        ...edits,
                        policy: {
                          ...policy,
                          circuitBreaker: { ...policy.circuitBreaker, failOpen: e.target.value === 'true' }
                        }
                      }
                    }))
                  }
                >
                  <option value="false">fail closed</option>
                  <option value="true">fail open</option>
                </select>
              </div>
              {configFields.length > 0 && (
                <div>
                  <label className="muted">Rotate config</label>
                  {configFields.map((field) => (
                    <input
                      key={`${instance.id}-${field.key}`}
                      className="input"
                      type={field.type === 'secret' ? 'password' : 'text'}
                      placeholder={field.label}
                      value={instanceConfigs[instance.id]?.[field.key] || ''}
                      onChange={(e) =>
                        setInstanceConfigs((prev) => ({
                          ...prev,
                          [instance.id]: { ...(prev[instance.id] || {}), [field.key]: e.target.value }
                        }))
                      }
                    />
                  ))}
                </div>
              )}
              <div className="row">
                <Button variant="secondary" onClick={() => toggleInstance(instance, !instance.enabled)}>
                  {instance.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="secondary" onClick={() => updateInstance(instance)}>
                  Save
                </Button>
                <Button onClick={() => testInstance(instance)}>Test</Button>
              </div>
              {testResults[instance.id] && (
                <div>
                  <div className="muted">Last test: {testResults[instance.id]?.ok ? 'OK' : 'Failed'}</div>
                  <ul>
                    {testResults[instance.id]?.checks.map((check) => (
                      <li key={`${instance.id}-${check.name}`}>
                        {check.name}: {check.ok ? 'OK' : 'Fail'} ({check.detail})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {isAdmin && (
        <div className="card-grid">
          <Card title="Recent Integration Activity" subtitle="Admin-only analytics">
            {events.length === 0 && <div className="muted">No recent integration events.</div>}
            <div className="stack">
              {events.map((event) => (
                <div key={event.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div>{event.type}</div>
                    <div className="muted">{summarizeEvent(event)}</div>
                  </div>
                  <div className="muted">{event.at}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Webhook Status" subtitle="Admin-only delivery summary">
            {!webhookStatus && <div className="muted">No webhook data.</div>}
            {webhookStatus && (
              <div className="stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Deliveries (24h)</span>
                  <span>{webhookStatus.total24h}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Failures (24h)</span>
                  <span>{webhookStatus.failures24h}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Last delivery</span>
                  <span>{webhookStatus.lastDeliveryAt || 'n/a'}</span>
                </div>
                {webhookStatus.lastError && <div className="muted">Last error: {webhookStatus.lastError}</div>}
                <div className="stack">
                  {webhookDeliveries.map((delivery) => (
                    <div key={delivery.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <div>{delivery.status === 'error' ? 'Failed' : 'Delivered'}</div>
                      <div className="muted">{delivery.at}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
      <div className="card-grid">
        <RpcEndpointManager endpoints={rpcEndpoints} />
      </div>
    </div>
  );
}
