import { fetch } from 'undici';

export class AlertmanagerClient {
  constructor(private baseUrl: string) {}

  async send(alert: any) {
    const res = await fetch(`${this.baseUrl}/api/v1/alerts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([alert])
    });
    if (!res.ok) throw new Error(`Alertmanager send failed: ${res.status}`);
    return res.json();
  }
}
