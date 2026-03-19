import { Logger } from "../utils/Logger.js";
import { GhostValidatorHealth } from "./GhostValidatorHealth.js";
import { GhostValidatorAutoRepair } from "./GhostValidatorAutoRepair.js";
import { ConfigLoader } from "../utils/ConfigLoader.js";

const log = Logger.create("ValidatorManager");

export type ValidatorStatus = "running" | "repairing" | "stopped" | "unknown";

export interface ValidatorInfo {
  status: ValidatorStatus;
  block?: bigint;
  peers?: number;
  syncing?: boolean;
  healthy?: boolean;
}

export class GhostValidatorManager {
  private readonly _autoRepairRunner: GhostValidatorAutoRepair;
  private readonly health: GhostValidatorHealth;
  private _status: ValidatorStatus = "unknown";

  constructor(private readonly rpcUrl: string) {
    this.health           = new GhostValidatorHealth();
    this._autoRepairRunner = new GhostValidatorAutoRepair();
  }

  static async create(): Promise<GhostValidatorManager> {
    const cfg = await ConfigLoader.loadFrom();
    return new GhostValidatorManager(cfg.rpc.l2 ?? "http://127.0.0.1:7260");
  }

  async start(): Promise<void> {
    log.info(`Starting validator at ${this.rpcUrl}`);
    this._status = "running";
    // In a production setup, this would trigger the validator process via
    // systemd / docker compose / k8s. Here we confirm liveness instead.
    const h = await this.health.check(this.rpcUrl);
    if (!h.healthy) {
      log.warn("Validator not yet healthy after start");
    }
  }

  async stop(): Promise<void> {
    log.info("Stopping validator");
    this._status = "stopped";
  }

  async restart(): Promise<void> {
    log.info("Restarting validator");
    await this.stop();
    await this.start();
  }

  async status(): Promise<ValidatorInfo> {
    try {
      const h = await this.health.check(this.rpcUrl);
      this._status = h.healthy ? "running" : "repairing";
      return {
        status:  this._status,
        block:   h.block,
        peers:   h.peers,
        syncing: h.syncing,
        healthy: h.healthy,
      };
    } catch {
      this._status = "unknown";
      return { status: "unknown" };
    }
  }

  async autoRepair(): Promise<void> {
    log.info("Running auto-repair");
    this._status = "repairing";
    const cfg = await ConfigLoader.loadFrom();
    await this._autoRepairRunner.repair(this.rpcUrl, cfg.validator?.minPeers ?? 2);
    this._status = "running";
    log.info("Auto-repair complete");
  }
}
