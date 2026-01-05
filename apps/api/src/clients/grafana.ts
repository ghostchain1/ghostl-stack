import { fetch } from 'undici';

export interface GrafanaDashboard {
  id: number;
  uid: string;
  title: string;
  url: string;
}

export class GrafanaClient {
  constructor(private baseUrl: string, private apiKey?: string) {}

  private headers() {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    return headers;
  }

  async listDashboards(): Promise<GrafanaDashboard[]> {
    const res = await fetch(`${this.baseUrl}/api/search?query=&type=dash-db`, {
      headers: this.headers()
    });
    if (!res.ok) throw new Error(`Grafana search failed: ${res.status}`);
    const data = (await res.json()) as any[];
    return data.map((d) => ({ id: d.id, uid: d.uid, title: d.title, url: `${this.baseUrl}${d.url}` }));
  }
}
