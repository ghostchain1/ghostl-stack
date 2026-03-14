import { ProcessRunner, type RunOptions } from "../utils/ProcessRunner.js";
import { ConfigLoader } from "../utils/ConfigLoader.js";

export interface FoundryAdapterOptions {
  projectRoot?: string;
}

export class GhostFoundryAdapter {
  private projectRoot: string;

  constructor(opts: FoundryAdapterOptions = {}) {
    this.projectRoot = opts.projectRoot ?? "contracts";
  }

  static async create(): Promise<GhostFoundryAdapter> {
    const cfg = await ConfigLoader.loadFrom();
    return new GhostFoundryAdapter({ projectRoot: cfg.foundry.projectRoot });
  }

  protected runOpts(extra: Partial<RunOptions> = {}): RunOptions {
    return { cwd: this.projectRoot, stream: true, ...extra };
  }

  async version(): Promise<string> {
    const r = await ProcessRunner.run("forge", ["--version"], { cwd: this.projectRoot });
    return r.stdout.trim();
  }

  async build(profile = "default"): Promise<void> {
    await ProcessRunner.exec("forge", ["build", "--profile", profile], this.runOpts());
  }

  async test(matchPath?: string, verbosity = 2): Promise<void> {
    const args = ["test", `-${"v".repeat(verbosity)}`];
    if (matchPath) args.push("--match-path", matchPath);
    await ProcessRunner.exec("forge", args, this.runOpts());
  }

  async clean(): Promise<void> {
    await ProcessRunner.exec("forge", ["clean"], this.runOpts());
  }

  async snapshot(): Promise<void> {
    await ProcessRunner.exec("forge", ["snapshot"], this.runOpts());
  }

  async coverage(): Promise<void> {
    await ProcessRunner.exec("forge", ["coverage"], this.runOpts());
  }
}
