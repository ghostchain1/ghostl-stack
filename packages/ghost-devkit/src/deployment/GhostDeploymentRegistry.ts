import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Logger } from "../utils/Logger.js";

const log = Logger.create("DeploymentRegistry");

export interface RegistryEntry {
  name: string;
  address: string;
  network: string;
  timestamp: string;
}

export class GhostDeploymentRegistry {
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly filePath: string;

  constructor(filePath = "deployments/registry.json") {
    this.filePath = resolve(filePath);
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const arr = JSON.parse(raw) as RegistryEntry[];
      for (const e of arr) this.entries.set(this.key(e.name, e.network), e);
    } catch {
      log.warn(`Could not parse registry at ${this.filePath}`);
    }
  }

  private key(name: string, network: string): string {
    return `${network}:${name}`;
  }

  register(name: string, address: string, network = "unknown"): void {
    const entry: RegistryEntry = { name, address, network, timestamp: new Date().toISOString() };
    this.entries.set(this.key(name, network), entry);
    this.persist();
    log.info(`Registered ${name} @ ${address} (${network})`);
  }

  get(name: string, network = "unknown"): RegistryEntry | undefined {
    return this.entries.get(this.key(name, network));
  }

  getAddress(name: string, network = "unknown"): string | undefined {
    return this.get(name, network)?.address;
  }

  list(network?: string): RegistryEntry[] {
    const all = [...this.entries.values()];
    return network ? all.filter((e) => e.network === network) : all;
  }

  export(): string {
    return JSON.stringify(this.list(), null, 2);
  }

  private persist(): void {
    try {
      writeFileSync(this.filePath, this.export(), "utf8");
    } catch {
      log.warn(`Could not persist registry to ${this.filePath}`);
    }
  }
}
