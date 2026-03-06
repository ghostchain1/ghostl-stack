import { ProcessRunner } from "../utils/ProcessRunner.js";
import { Logger } from "../utils/Logger.js";
import { GhostDeploymentRegistry } from "./GhostDeploymentRegistry.js";

const log = Logger.create("DeploymentEngine");

export interface DeploymentEngineOptions {
  rpcUrl: string;
  confirmations?: number;
  privateKey?: string;
  gasLimit?: string;
  verifyApiKey?: string;
  slow?: boolean;
}

export interface DeployResult {
  contract: string;
  network: string;
  address?: string;
  txHash?: string;
  success: boolean;
  error?: string;
}

export class GhostDeploymentEngine {
  private readonly rpcUrl: string;
  private readonly confirmations: number;
  private readonly privateKey: string;
  private readonly gasLimit: string;
  private readonly verifyApiKey: string;
  private readonly slow: boolean;
  private readonly registry: GhostDeploymentRegistry;

  constructor(opts: DeploymentEngineOptions) {
    this.rpcUrl       = opts.rpcUrl;
    this.confirmations = opts.confirmations ?? 1;
    this.privateKey   = opts.privateKey   ?? process.env["PRIVATE_KEY"] ?? "";
    this.gasLimit     = opts.gasLimit     ?? "";
    this.verifyApiKey = opts.verifyApiKey ?? process.env["ETHERSCAN_API_KEY"] ?? "";
    this.slow         = opts.slow         ?? false;
    this.registry     = new GhostDeploymentRegistry();
  }

  /** Deploy a named contract via `forge create`. */
  async deploy(contract: string, network: string): Promise<DeployResult> {
    log.info(`Deploying ${contract} → ${network} (${this.rpcUrl})`);
    const args = [
      "create", contract,
      "--rpc-url", this.rpcUrl,
      "--broadcast",
      "--confirmations", String(this.confirmations),
      "--json",
    ];
    if (this.privateKey)  args.push("--private-key", this.privateKey);
    if (this.gasLimit)    args.push("--gas-limit",   this.gasLimit);
    if (this.slow)        args.push("--slow");

    try {
      const raw = await ProcessRunner.exec("forge", args);
      const j   = JSON.parse(raw) as { deployedTo: string; transactionHash: string };
      log.info(`${contract} deployed at ${j.deployedTo}`);
      this.registry.register(contract, j.deployedTo, network);
      return { contract, network, address: j.deployedTo, txHash: j.transactionHash, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Deploy failed: ${msg}`);
      return { contract, network, success: false, error: msg };
    }
  }

  /** Run a Foundry script (broadcast). */
  async runScript(script: string, network: string): Promise<DeployResult> {
    log.info(`Running script ${script} → ${network}`);
    const args = [
      "script", script,
      "--rpc-url", this.rpcUrl,
      "--broadcast",
      "--confirmations", String(this.confirmations),
    ];
    if (this.privateKey)  args.push("--private-key", this.privateKey);
    if (this.slow)        args.push("--slow");
    if (this.verifyApiKey) {
      args.push("--verify", "--ghostscan-api-key", this.verifyApiKey);
    }

    try {
      await ProcessRunner.exec("forge", args, { stream: true });
      return { contract: script, network, success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Script failed: ${msg}`);
      return { contract: script, network, success: false, error: msg };
    }
  }

  /** Get the registry (for querying deployed addresses). */
  getRegistry(): GhostDeploymentRegistry {
    return this.registry;
  }
}
