
export class GuardClient {
  constructor(private baseUrl: string, private adminToken?: string) {}

  private headers() {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.adminToken) headers['x-admin-token'] = this.adminToken;
    return headers;
  }

  async listAlerts() {
    const res = await fetch(`${this.baseUrl}/alerts`);
    if (!res.ok) throw new Error(`Guard alerts failed: ${res.status}`);
    return res.json();
  }

  async getPolicy() {
    const res = await fetch(`${this.baseUrl}/policy`);
    if (!res.ok) throw new Error(`Guard policy failed: ${res.status}`);
    return res.json();
  }

  async setPolicy(path: 'mode' | 'threshold' | 'delay', body: unknown) {
    const res = await fetch(`${this.baseUrl}/policy/${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Guard policy write failed: ${res.status}`);
    return res.json();
  }

  async listPolicies() {
    const res = await fetch(`${this.baseUrl}/policy`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Guard policy read failed: ${res.status}`);
    return res.json();
  }
}
