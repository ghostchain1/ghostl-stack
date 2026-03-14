import { z } from 'zod';
import { resolveComplianceBase } from './runtime';

const baseUrl = () => resolveComplianceBase();

const authToken = () => {
  if (typeof window !== 'undefined') return undefined;
  return process.env.COMPLIANCE_ANALYST_JWT || process.env.COMPLIANCE_VIEWER_JWT || process.env.COMPLIANCE_ADMIN_JWT;
};

const randomHex = () => {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Math.random()}${Date.now()}`;
  return uuid.replace(/[^a-f0-9]/gi, '').padEnd(32, '0');
};

const traceparent = () => {
  const traceId = randomHex().slice(0, 32);
  const spanId = randomHex().slice(0, 16);
  return `00-${traceId}-${spanId}-01`;
};

const errorSchema = z.object({
  error: z.string(),
  hint: z.string().optional()
});

export const decisionSchema = z.object({
  request_id: z.string(),
  action: z.string(),
  decision: z.string(),
  reasons: z.array(z.string()),
  required_controls: z.array(z.string()),
  disclosures: z.array(z.string()),
  matched_rules: z.array(z.string()),
  policy_bundle_id: z.string(),
  evidence_bundle_id: z.string(),
  created_at: z.string(),
  wallet_address: z.string(),
  chain_id: z.string(),
  user_id: z.string().nullable(),
  residency_country: z.string().nullable(),
  kyc_level: z.string().nullable()
});

export const bundleSchema = z.object({
  apiVersion: z.string(),
  kind: z.string(),
  metadata: z.object({ bundleId: z.string(), version: z.string() }),
  defaults: z
    .object({
      conflictStrategy: z.string().optional(),
      decisionTTLSeconds: z.number().optional()
    })
    .optional(),
  policies: z.array(
    z.object({
      id: z.string(),
      priority: z.number(),
      appliesTo: z.object({ actions: z.array(z.string()) }),
      when: z.unknown(),
      effect: z.unknown()
    })
  )
});

export const lawSchema = z.object({
  id: z.string(),
  jurisdiction_code: z.string(),
  topic: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  versions: z.array(
    z.object({
      version: z.string(),
      effective_from: z.string(),
      effective_to: z.string().nullable(),
      text: z.string()
    })
  )
});

export const predictionSchema = z.object({
  id: z.string(),
  jurisdiction: z.string(),
  topic: z.string(),
  risk_delta: z.number(),
  summary: z.string(),
  features: z.unknown(),
  created_at: z.string()
});

export const evidenceSchema = z.object({
  id: z.string(),
  subject_id: z.string(),
  decision_id: z.string().nullable(),
  prev_hash: z.string().nullable(),
  hash: z.string(),
  artifacts: z.unknown(),
  created_at: z.string()
});

export async function fetchJson<T>(path: string, schema: z.ZodSchema<T>): Promise<{ data?: T; error?: string }> {
  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    traceparent: traceparent()
  };
  const token = authToken();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { headers, cache: 'no-store' });
  } catch {
    return {
      error: `${path} failed: network_error. Hint: Check COMPLIANCE_URL (${baseUrl()}) and service health.`
    };
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const parsed = errorSchema.safeParse(payload);
    const hint = parsed.success ? parsed.data.hint : undefined;
    const statusLabel = `HTTP ${res.status}`;
    const message = parsed.success ? parsed.data.error : statusLabel;
    return {
      error: `${path} failed: ${message}${parsed.success ? ` (${statusLabel})` : ''}${hint ? `. Hint: ${hint}` : ''}`
    };
  }

  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { error: `${path} failed: invalid_response_shape` };
  }
  return { data: parsed.data };
}
