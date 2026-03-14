export interface GhostClientOptions {
  brainUrl:  string;    // ws:// or wss:// endpoint
  httpBase:  string;    // https://ghostbrain.example.com
  apiKey:    string;
}

/**
 * Browser-safe (Next.js / edge-compatible) GhostBrain client.
 * Uses the native WebSocket API — no Node-only `ws` module.
 */
export class GhostClient {
  private readonly opts: GhostClientOptions;

  constructor(opts: GhostClientOptions) {
    this.opts = opts;
  }

  /**
   * Open a native browser WebSocket to GhostBrain.
   * Returns the raw WebSocket so callers can add their own listeners.
   */
  connectBrain(): WebSocket {
    const ws = new WebSocket(this.opts.brainUrl);

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          type:    "auth",
          apiKey:  this.opts.apiKey,
        })
      );
    });

    return ws;
  }

  /**
   * Simple HTTP helper for GhostBrain REST routes.
   */
  async ghostBrainHttp<T>(
    path:  string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body?: Record<string, any>
  ): Promise<T> {
    const url  = `${this.opts.httpBase}${path}`;
    const init: RequestInit = {
      method:  body ? "POST" : "GET",
      headers: {
        "Content-Type":    "application/json",
        "x-ghost-api-key": this.opts.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    };

    const res = await fetch(url, init);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GhostClient: ${res.status} ${res.statusText} — ${text}`);
    }

    return res.json() as Promise<T>;
  }
}
