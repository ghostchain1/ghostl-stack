import { describe, expect, it } from 'vitest';
import request from 'supertest';

const baseUrl = process.env.COMPLIANCE_API_URL || 'http://localhost:8090';

const authHeader = () => {
  const token = process.env.COMPLIANCE_ADMIN_JWT;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
};

describe('ghost-compliance API', () => {
  it('returns health', async () => {
    const res = await request(baseUrl).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns active policy bundle', async () => {
    const res = await request(baseUrl).get('/v1/policies/active').set(authHeader() || {});
    expect([200, 404]).toContain(res.status);
  });

  it('returns decisions audit', async () => {
    const res = await request(baseUrl).get('/v1/audit/decisions').set(authHeader() || {});
    expect([200, 401, 403]).toContain(res.status);
  });
});
