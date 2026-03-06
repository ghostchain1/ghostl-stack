import { ProcessRunner } from "../utils/ProcessRunner.js";
import { Logger } from "../utils/Logger.js";
import { GhostValidatorHealth } from "./GhostValidatorHealth.js";
const log = Logger.create("ValidatorAutoRepair");
export class GhostValidatorAutoRepair {
    health = new GhostValidatorHealth();
    async repair(rpcUrl, minPeers) {
        log.info(`Running repair for ${rpcUrl} (minPeers=${minPeers})`);
        const h = await this.health.check(rpcUrl);
        if (h.syncing) {
            log.warn("Node is still syncing — giving it time");
            return { action: "none", detail: "syncing" };
        }
        if ((h.peers ?? 0) < minPeers) {
            log.warn(`Low peers (${h.peers}/${minPeers}) — attempting enforcement`);
            await this.addBootnodesViaAdmin(rpcUrl);
            return { action: "ensurePeers", detail: `was ${h.peers}` };
        }
        if (!h.healthy) {
            log.warn("Unhealthy node — attempting soft restart via docker compose");
            const result = await this.dockerRestartValidator();
            return result
                ? { action: "restart", detail: "docker compose restart ghostl2-validator" }
                : { action: "failed", detail: "docker compose restart failed" };
        }
        log.info("Node is healthy, no repair needed");
        return { action: "none" };
    }
    async dockerRestartValidator() {
        try {
            await ProcessRunner.exec("docker", ["compose", "restart", "ghostl2-validator"]);
            log.info("Restarted ghostl2-validator container");
            return true;
        }
        catch (err) {
            log.error(`Docker restart failed: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }
    async addBootnodesViaAdmin(rpcUrl) {
        // admin_addPeer is a Geth/polygon-edge extension
        const bootnode = process.env["L2_BOOTNODE_ENODE"] ?? "";
        if (!bootnode) {
            log.warn("No L2_BOOTNODE_ENODE set — cannot add peer");
            return;
        }
        try {
            await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "admin_addPeer", params: [bootnode] }),
                signal: AbortSignal.timeout(4_000),
            });
        }
        catch (err) {
            log.warn(`admin_addPeer failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
