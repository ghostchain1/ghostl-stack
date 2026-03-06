import { ProcessRunner } from "../utils/ProcessRunner.js";
import { ConfigLoader } from "../utils/ConfigLoader.js";

export interface ForgeRunOptions {
  profile?: string;
  matchPath?: string;
  matchTest?: string;
  verbosity?: number;
  gasReport?: boolean;
  forkUrl?: string;
  forkBlock?: number;
}

export class GhostForgeRunner {
  private projectRoot: string;

  constructor(projectRoot = "contracts") {
    this.projectRoot = projectRoot;
  }

  static async create(): Promise<GhostForgeRunner> {
    const cfg = await ConfigLoader.loadFrom();
    return new GhostForgeRunner(cfg.foundry.projectRoot);
  }

  async build(profile = "default"): Promise<void> {
    await ProcessRunner.exec(
      "forge",
      ["build", "--profile", profile],
      { cwd: this.projectRoot, stream: true },
    );
  }

  async test(opts: ForgeRunOptions = {}): Promise<void> {
    const args: string[] = ["test"];
    const v = opts.verbosity ?? 2;
    args.push(`-${"v".repeat(v)}`);
    if (opts.profile)    args.push("--profile",    opts.profile);
    if (opts.matchPath)  args.push("--match-path", opts.matchPath);
    if (opts.matchTest)  args.push("--match-test", opts.matchTest);
    if (opts.gasReport)  args.push("--gas-report");
    if (opts.forkUrl)    args.push("--fork-url",   opts.forkUrl);
    if (opts.forkBlock)  args.push("--fork-block-number", String(opts.forkBlock));

    await ProcessRunner.exec("forge", args, { cwd: this.projectRoot, stream: true });
  }

  async script(scriptPath: string, rpcUrl: string, broadcast = false, pk?: string): Promise<void> {
    const args = ["script", scriptPath, "--rpc-url", rpcUrl, "-vvvv"];
    if (broadcast) args.push("--broadcast");
    if (pk)        args.push("--private-key", pk);

    await ProcessRunner.exec("forge", args, {
      cwd: this.projectRoot,
      stream: true,
      env: pk ? { PRIVATE_KEY: pk } : {},
    });
  }

  async verify(address: string, contract: string, chainId: number, apiKey: string): Promise<void> {
    await ProcessRunner.exec(
      "forge",
      ["verify-contract", address, contract, "--chain-id", String(chainId), "--ghostscan-api-key", apiKey],
      { cwd: this.projectRoot, stream: true },
    );
  }
}
