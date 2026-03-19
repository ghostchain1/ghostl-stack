import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "../utils/Logger.js";
import { GhostContractTemplate } from "./GhostContractTemplate.js";

const log = Logger.create("ProjectGenerator");

export interface GenerateOptions {
  name?: string;
  network?: string;
  overwrite?: boolean;
}

export class GhostProjectGenerator {
  private readonly tpl = new GhostContractTemplate();

  async create(dir: string, opts: GenerateOptions = {}): Promise<void> {
    const name = opts.name ?? "GhostProject";
    log.info(`Generating project "${name}" at ${dir}`);

    if (existsSync(dir) && !opts.overwrite) {
      throw new Error(`Directory already exists: ${dir}. Use --force to overwrite.`);
    }

    // Create directory structure
    const dirs = ["contracts/src", "contracts/test", "contracts/script", "scripts", "lib"];
    for (const d of dirs) mkdirSync(join(dir, d), { recursive: true });

    // foundry.toml
    writeFileSync(join(dir, "foundry.toml"), this.foundryToml(name), "utf8");

    // ghost.config.json
    writeFileSync(join(dir, "ghost.config.json"), this.ghostConfig(name, opts.network ?? "testnet"), "utf8");

    // Sample contract
    writeFileSync(
      join(dir, `contracts/src/${name}.sol`),
      this.tpl.generate(name),
      "utf8",
    );

    // Sample test
    writeFileSync(
      join(dir, `contracts/test/${name}.t.sol`),
      this.tpl.generateTest(name),
      "utf8",
    );

    // Deploy script
    writeFileSync(
      join(dir, `contracts/script/Deploy${name}.s.sol`),
      this.tpl.generateScript(name),
      "utf8",
    );

    // .gitignore
    writeFileSync(join(dir, ".gitignore"), GhostContractTemplate.GITIGNORE, "utf8");

    log.info(`Project scaffold created at ${dir}`);
  }

  private foundryToml(name: string): string {
    return `[profile.default]
src     = "contracts/src"
test    = "contracts/test"
script  = "contracts/script"
out     = "contracts/out"
libs    = ["lib"]
optimizer        = true
optimizer_runs   = 200
`;
  }

  private ghostConfig(name: string, network: string): string {
    return JSON.stringify({
      network,
      rpc: { l1: "http://127.0.0.1:18545", l2: "http://127.0.0.1:7260", l3: "http://127.0.0.1:7270" },
      deployment: { confirmations: 1, gasMultiplier: 1.2 },
      foundry: { projectRoot: ".", outDir: "contracts/out", scriptDir: "contracts/script" },
      validator: { minPeers: 2, restartOnLowPeers: true },
      ghostbrainUrl: "http://127.0.0.1:8080",
    }, null, 2);
  }
}
