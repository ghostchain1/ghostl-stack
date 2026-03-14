import { Logger } from "../../utils/Logger.js";
import { ConfigLoader } from "../../utils/ConfigLoader.js";
import { ProcessRunner } from "../../utils/ProcessRunner.js";
const log = Logger.create("doctor");
async function checkBinary(bin, arg = "--version") {
    try {
        const result = await ProcessRunner.run(bin, [arg]);
        const ver = result.stdout.trim().split("\n")[0] ?? "";
        return { name: bin, ok: result.code === 0, detail: ver };
    }
    catch {
        return { name: bin, ok: false, detail: "not found" };
    }
}
async function checkRpc(label, url) {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_blockNumber", params: [] }),
            signal: AbortSignal.timeout(4000),
        });
        const json = await res.json();
        return { name: `RPC ${label}`, ok: Boolean(json.result), detail: json.result ?? "no result" };
    }
    catch (err) {
        return { name: `RPC ${label}`, ok: false, detail: err.message };
    }
}
export async function run(_ctx) {
    const cfg = await ConfigLoader.loadFrom();
    log.info("Running Ghost stack diagnostics…\n");
    const checks = await Promise.all([
        checkBinary("node"),
        checkBinary("forge", "--version"),
        checkBinary("cast", "--version"),
        checkBinary("anvil", "--version"),
        checkBinary("docker", "--version"),
        checkRpc("L1", cfg.rpc.l1),
        checkRpc("L2", cfg.rpc.l2),
        checkRpc("L3", cfg.rpc.l3),
    ]);
    let allOk = true;
    for (const c of checks) {
        const icon = c.ok ? "✓" : "✗";
        const colour = c.ok ? "\x1b[32m" : "\x1b[31m";
        console.log(`${colour}${icon}\x1b[0m  ${c.name.padEnd(18)} ${c.detail ?? ""}`);
        if (!c.ok)
            allOk = false;
    }
    console.log();
    if (allOk) {
        log.info("All checks passed — Ghost stack is healthy.");
    }
    else {
        log.warn("Some checks failed — see above for details.");
        process.exit(1);
    }
}
