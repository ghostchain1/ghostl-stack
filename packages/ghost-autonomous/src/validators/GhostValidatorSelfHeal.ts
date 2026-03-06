import { ProcessRunner } from "@ghostchain/devkit";
import { Logger } from "@ghostchain/devkit";
import type { NodeConfig } from "./GhostValidatorSupervisor.js";

const log = Logger.create("ValidatorSelfHeal");

export class GhostValidatorSelfHeal {
  async repair(node: NodeConfig): Promise<void> {
    const synced = await this.isSynced(node.rpcUrl);
    if (!synced) {
      log.warn(`${node.name}: not synced — restarting via docker compose`);
      await this.dockerRestart(node.name);
    } else {
      log.info(`${node.name}: synced, no restart needed`);
    }
  }

  private async isSynced(rpcUrl: string): Promise<boolean> {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "ghost_syncing", params: [] }),
        signal: AbortSignal.timeout(4_000),
      });
      const j = await res.json() as { result: boolean | object };
      return j.result === false; // false = synced; object = still syncing
    } catch {
      return false;
    }
  }

  private async dockerRestart(serviceName: string): Promise<void> {
    try {
      await ProcessRunner.exec("docker", ["compose", "restart", serviceName]);
      log.info(`Restarted container: ${serviceName}`);
    } catch (err) {
      log.error(`docker compose restart failed for ${serviceName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
