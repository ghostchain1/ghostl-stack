const withQuery = (base: string, params: Record<string, string | number | undefined>) => {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

export class GasEngineClient {
  constructor(private baseUrl: string) {}

  private async fetchJson(path: string, params: Record<string, string | number | undefined> = {}) {
    const url = withQuery(`${this.baseUrl}${path}`, params);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`gas_engine_${res.status}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  gasMetrics(chain: string, limit?: number) {
    return this.fetchJson('/v1/gas/metrics', { chain, limit });
  }

  gasRecommendations(chain: string) {
    return this.fetchJson('/v1/gas/recommendations', { chain });
  }

  gasPolicy(chain: string) {
    return this.fetchJson('/v1/gas/policy', { chain });
  }

  slashingEvents(chain: string, limit?: number) {
    return this.fetchJson('/v1/gas/slashing-events', { chain, limit });
  }
}
