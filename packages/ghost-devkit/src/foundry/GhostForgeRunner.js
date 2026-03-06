import { ProcessRunner } from "../utils/ProcessRunner.js";
import { ConfigLoader } from "../utils/ConfigLoader.js";
export class GhostForgeRunner {
    projectRoot;
    constructor(projectRoot = "contracts") {
        this.projectRoot = projectRoot;
    }
    static async create() {
        const cfg = await ConfigLoader.loadFrom();
        return new GhostForgeRunner(cfg.foundry.projectRoot);
    }
    async build(profile = "default") {
        await ProcessRunner.exec("forge", ["build", "--profile", profile], { cwd: this.projectRoot, stream: true });
    }
    async test(opts = {}) {
        const args = ["test"];
        const v = opts.verbosity ?? 2;
        args.push(`-${"v".repeat(v)}`);
        if (opts.profile)
            args.push("--profile", opts.profile);
        if (opts.matchPath)
            args.push("--match-path", opts.matchPath);
        if (opts.matchTest)
            args.push("--match-test", opts.matchTest);
        if (opts.gasReport)
            args.push("--gas-report");
        if (opts.forkUrl)
            args.push("--fork-url", opts.forkUrl);
        if (opts.forkBlock)
            args.push("--fork-block-number", String(opts.forkBlock));
        await ProcessRunner.exec("forge", args, { cwd: this.projectRoot, stream: true });
    }
    async script(scriptPath, rpcUrl, broadcast = false, pk) {
        const args = ["script", scriptPath, "--rpc-url", rpcUrl, "-vvvv"];
        if (broadcast)
            args.push("--broadcast");
        if (pk)
            args.push("--private-key", pk);
        await ProcessRunner.exec("forge", args, {
            cwd: this.projectRoot,
            stream: true,
            env: pk ? { PRIVATE_KEY: pk } : {},
        });
    }
    async verify(address, contract, chainId, apiKey) {
        await ProcessRunner.exec("forge", ["verify-contract", address, contract, "--chain-id", String(chainId), "--etherscan-api-key", apiKey], { cwd: this.projectRoot, stream: true });
    }
}
