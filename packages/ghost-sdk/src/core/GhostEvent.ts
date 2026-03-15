/**
 * GhostEvent — sovereign event watching system.
 * Replaces ethers EventFilter with Ghost-native log subscriptions.
 */
import { GhostProvider } from "./GhostProvider";
import { GhostLog } from "./GhostTransaction";

export interface GhostEventFilter {
  address?: string;
  topics?:  (string | null)[];
  fromBlock?: number | "latest";
  toBlock?:   number | "latest";
}

export class GhostEvent {
  private provider: GhostProvider;
  private listeners: Map<string, Array<(log: GhostLog) => void>> = new Map();

  constructor(provider: GhostProvider) {
    this.provider = provider;
  }

  async getLogs(filter: GhostEventFilter): Promise<GhostLog[]> {
    return this.provider.getLogs(filter) as Promise<GhostLog[]>;
  }

  on(topic: string, handler: (log: GhostLog) => void): void {
    const existing = this.listeners.get(topic) ?? [];
    existing.push(handler);
    this.listeners.set(topic, existing);
  }

  off(topic: string, handler: (log: GhostLog) => void): void {
    const existing = this.listeners.get(topic) ?? [];
    this.listeners.set(topic, existing.filter(h => h !== handler));
  }

  emit(topic: string, log: GhostLog): void {
    const handlers = this.listeners.get(topic) ?? [];
    handlers.forEach(h => h(log));
  }
}
