import { Logger } from "@ghostchain/devkit";
import { GhostValidatorSelfHeal } from "./GhostValidatorSelfHeal.js";

const log = Logger.create("ValidatorSupervisor");

export interface NodeConfig {
  name: string;
  rpcUrl: string;
  minPeers?: number;
}

export class GhostValidatorSupervisor {
  private readonly healer = new GhostValidatorSelfHeal();

  /** Monitor a list of nodes indefinitely (one pass). */
  async monitor(nodes: NodeConfig[]): Promise<void> {
    log.info(`Monitoring ${nodes.length} node(s)`);
    await Promise.all(nodes.map((n) => this.checkNode(n)));
  }

  /** Run a continuous monitor loop. */
  async loop(nodes: NodeConfig[], intervalMs = 15_000): Promise<never> {
    log.info(`Starting supervisor loop (interval=${intervalMs}ms)`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await this.monitor(nodes);
      await new Promise<void>((r) => setTimeout(r, intervalMs));
    }
  }

  private async checkNode(node: NodeConfig): Promise<void> {
    const minPeers = node.minPeers ?? 3;
    try {
      const peers = await this.getPeers(node.rpcUrl);
      if (peers < minPeers) {
        log.warn(`${node.name}: peers=${peers} < ${minPeers} — triggering self-heal`);
        await this.healer.repair(node);
      } else {
        log.debug(`${node.name}: peers=${peers} OK`);
      }
    } catch (err) {
      log.error(`${node.name}: probe failed — ${err instanceof Error ? err.message : String(err)}`);
      await this.healer.repair(node);
    }
  }

  private async getPeers(rpcUrl: string): Promise<number> {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "net_peerCount", params: [] }),
      signal: AbortSignal.timeout(4_000),
    });
    const j = await res.json() as { result: string };
    return parseInt(j.result, 16);
  }
}
