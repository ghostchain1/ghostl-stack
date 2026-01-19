
export class RelayerClient {
  constructor(private baseUrl: string) {}

  async health() {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`Relayer health failed: ${res.status}`);
    return res.json() as Promise<Record<string, unknown>>;
  }
}
