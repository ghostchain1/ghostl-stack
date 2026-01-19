
export interface PrometheusVectorResult {
  metric: Record<string, string>;
  value: [number, string];
}

export interface PrometheusRangeResult {
  metric: Record<string, string>;
  values: [number, string][];
}

export interface PrometheusAlert {
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  state?: string;
  activeAt?: string;
  value?: number | string;
}

export interface PrometheusApiResponse<T = unknown> {
  status: 'success' | 'error';
  data: T;
  errorType?: string;
  error?: string;
}

export class PrometheusClient {
  constructor(private baseUrl: string) {}

  private buildUrl(path: string, params?: Record<string, string>) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    return url.toString();
  }

  async query(query: string): Promise<PrometheusVectorResult[]> {
    const res = await fetch(this.buildUrl('/api/v1/query', { query }));
    if (!res.ok) throw new Error(`Prometheus query failed: ${res.status}`);
    const json = (await res.json()) as PrometheusApiResponse<{ result: PrometheusVectorResult[] }>;
    return json.data?.result || [];
  }

  async queryRange(query: string, startMs: number, endMs: number, stepSeconds = 15): Promise<PrometheusRangeResult[]> {
    const params = {
      query,
      start: String(Math.floor(startMs / 1000)),
      end: String(Math.floor(endMs / 1000)),
      step: String(stepSeconds)
    };
    const res = await fetch(this.buildUrl('/api/v1/query_range', params));
    if (!res.ok) throw new Error(`Prometheus range query failed: ${res.status}`);
    const json = (await res.json()) as PrometheusApiResponse<{ result: PrometheusRangeResult[] }>;
    return json.data?.result || [];
  }

  async alerts(): Promise<PrometheusAlert[]> {
    const res = await fetch(this.buildUrl('/api/v1/alerts'));
    if (!res.ok) throw new Error(`Prometheus alerts failed: ${res.status}`);
    const json = (await res.json()) as PrometheusApiResponse<{ alerts: PrometheusAlert[] }>;
    return json.data?.alerts || [];
  }
}
