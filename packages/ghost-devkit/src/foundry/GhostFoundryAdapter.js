import { ProcessRunner } from "../utils/ProcessRunner.js";
import { ConfigLoader } from "../utils/ConfigLoader.js";
export class GhostFoundryAdapter {
    projectRoot;
    constructor(opts = {}) {
        this.projectRoot = opts.projectRoot ?? "contracts";
    }
    static async create() {
        const cfg = await ConfigLoader.loadFrom();
        return new GhostFoundryAdapter({ projectRoot: cfg.foundry.projectRoot });
    }
    runOpts(extra = {}) {
        return { cwd: this.projectRoot, stream: true, ...extra };
    }
    async version() {
        const r = await ProcessRunner.run("forge", ["--version"], { cwd: this.projectRoot });
        return r.stdout.trim();
    }
    async build(profile = "default") {
        await ProcessRunner.exec("forge", ["build", "--profile", profile], this.runOpts());
    }
    async test(matchPath, verbosity = 2) {
        const args = ["test", `-${"v".repeat(verbosity)}`];
        if (matchPath)
            args.push("--match-path", matchPath);
        await ProcessRunner.exec("forge", args, this.runOpts());
    }
    async clean() {
        await ProcessRunner.exec("forge", ["clean"], this.runOpts());
    }
    async snapshot() {
        await ProcessRunner.exec("forge", ["snapshot"], this.runOpts());
    }
    async coverage() {
        await ProcessRunner.exec("forge", ["coverage"], this.runOpts());
    }
}
