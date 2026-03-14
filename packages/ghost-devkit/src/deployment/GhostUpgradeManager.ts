import { ProcessRunner } from "../utils/ProcessRunner.js";
import { Logger } from "../utils/Logger.js";

const log = Logger.create("UpgradeManager");

export interface UpgradeResult {
  proxy: string;
  implementation: string;
  network: string;
  txHash?: string;
  success: boolean;
  error?: string;
}

/**
 * GhostUpgradeManager — handles transparent / UUPS proxy upgrades via a
 * Foundry upgrade script plus calls to `cast send` for last-mile execution.
 */
export class GhostUpgradeManager {
  constructor(
    private readonly rpcUrl: string,
    private readonly privateKey: string = process.env["PRIVATE_KEY"] ?? "",
  ) {}

  /**
   * Upgrade `proxy` to point to `implementation` on `network`.
   *
   * Calls `upgradeTo(address)` (transparent / UUPS ABI) directly via cast.
   */
  async upgrade(proxy: string, implementation: string, network: string): Promise<UpgradeResult> {
    log.info(`Upgrading proxy ${proxy} → impl ${implementation} on ${network}`);

    // ABI signature for UUPS / TransparentUpgradeableProxy
    const upgradeSelector = "upgradeTo(address)";

    const args = [
      "send", proxy, upgradeSelector, implementation,
      "--rpc-url",    this.rpcUrl,
      "--json",
    ];
    if (this.privateKey) args.push("--private-key", this.privateKey);

    try {
      const raw = await ProcessRunner.exec("cast", args);
      const j   = JSON.parse(raw) as { transactionHash: string };
      log.info(`Upgrade tx: ${j.transactionHash}`);
      return { proxy, implementation, network, txHash: j.transactionHash, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Upgrade failed: ${msg}`);
      return { proxy, implementation, network, success: false, error: msg };
    }
  }

  /** Upgrade via a Foundry upgrade script instead of direct cast call. */
  async upgradeViaScript(
    scriptPath: string,
    proxy: string,
    implementation: string,
    network: string,
  ): Promise<UpgradeResult> {
    log.info(`Upgrade script: ${scriptPath}`);
    const args = [
      "script", scriptPath,
      "--rpc-url",   this.rpcUrl,
      "--broadcast",
      "--sig",       `run(address,address)`,
      proxy, implementation,
    ];
    if (this.privateKey) args.push("--private-key", this.privateKey);

    try {
      await ProcessRunner.exec("forge", args, { stream: true });
      return { proxy, implementation, network, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Upgrade script failed: ${msg}`);
      return { proxy, implementation, network, success: false, error: msg };
    }
  }
}
