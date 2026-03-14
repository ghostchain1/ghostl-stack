
export interface LokiLogEntry {
  stream: Record<string, string>;
  values: [string, string][];
}

export class LokiClient {
  constructor(private baseUrl: string) {}

  async query(query: string, limit = 100): Promise<LokiLogEntry[]> {
    const url = new URL(`${this.baseUrl}/loki/api/v1/query`);
    url.searchParams.set('query', query);
    url.searchParams.set('limit', String(limit));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Loki query failed: ${res.status}`);
    const json = (await res.json()) as { data?: { result?: LokiLogEntry[] } };
    return json.data?.result || [];
  }

  async queryRange(query: string, startNs: number, endNs: number, limit = 100): Promise<LokiLogEntry[]> {
    const url = new URL(`${this.baseUrl}/loki/api/v1/query_range`);
    url.searchParams.set('query', query);
    url.searchParams.set('start', String(startNs));
    url.searchParams.set('end', String(endNs));
    url.searchParams.set('limit', String(limit));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Loki range query failed: ${res.status}`);
    const json = (await res.json()) as { data?: { result?: LokiLogEntry[] } };
    return json.data?.result || [];
  }
}
