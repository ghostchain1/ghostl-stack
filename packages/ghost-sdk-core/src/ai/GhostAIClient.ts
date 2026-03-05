// ─────────────────────────────────────────────────────────────────────────────
// GhostAIClient – GhostBrain AI inference gateway
// ─────────────────────────────────────────────────────────────────────────────
import type { GhostAIResponse } from "../types";

export interface GhostAIOptions {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export class GhostAIClient {
  private endpoint: string;
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(opts: GhostAIOptions = {}) {
    this.endpoint = opts.endpoint ?? "http://localhost:11434/api/generate";
    this.apiKey = opts.apiKey ?? "";
    this.model = opts.model ?? "llama3";
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  async complete(prompt: string, options?: { temperature?: number }): Promise<GhostAIResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { temperature: options?.temperature ?? 0.7 }
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`AI gateway error: HTTP ${res.status}`);
      }

      const json = await res.json();
      return {
        result: json.response ?? json.content ?? "",
        confidence: json.confidence ?? 1.0,
        model: json.model ?? this.model,
        latencyMs: Date.now() - start
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Classify a transaction's risk level using the AI model. */
  async classifyTxRisk(txJson: string): Promise<"low" | "medium" | "high"> {
    const prompt = `You are a blockchain security expert. Classify the risk of this transaction as low, medium, or high. Answer with one word only.\n\nTransaction: ${txJson}`;
    const res = await this.complete(prompt, { temperature: 0 });
    const answer = res.result.trim().toLowerCase();
    if (answer.includes("high")) return "high";
    if (answer.includes("medium")) return "medium";
    return "low";
  }
}
