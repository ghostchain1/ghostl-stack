import { Logger } from "../../utils/Logger.js";
import { ConfigLoader } from "../../utils/ConfigLoader.js";
import type { CLIContext } from "../GhostCLI.js";

const log = Logger.create("bridge");

const USAGE = `
ghost bridge <subcommand>

  status   Show pending bridge messages
  monitor  Live watch bridge events (Ctrl-C to exit)
`;

async function rpcRequest(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    signal: AbortSignal.timeout(6000),
  });
  const json = await res.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export async function run(ctx: CLIContext): Promise<void> {
  const sub = ctx.args[1] ?? "status";
  const cfg = await ConfigLoader.loadFrom();

  switch (sub) {
    case "status": {
      log.info("Fetching bridge status…");
      const layers: Array<[string, string]> = [
        ["L1→L2", cfg.rpc.l2],
        ["L2→L3", cfg.rpc.l3],
      ];
      for (const [label, url] of layers) {
        try {
          const block = await rpcRequest(url, "eth_blockNumber") as string;
          log.info(`${label}: settled at block ${parseInt(block, 16)}`);
        } catch (err) {
          log.warn(`${label}: unreachable — ${(err as Error).message}`);
        }
      }
      break;
    }

    case "monitor": {
      log.info("Monitoring bridge events (Ctrl-C to stop)…");
      let prev = { l2: 0, l3: 0 };
      const poll = async () => {
        try {
          const [b2, b3] = await Promise.all([
            rpcRequest(cfg.rpc.l2, "eth_blockNumber") as Promise<string>,
            rpcRequest(cfg.rpc.l3, "eth_blockNumber") as Promise<string>,
          ]);
          const n2 = parseInt(b2, 16);
          const n3 = parseInt(b3, 16);
          if (n2 !== prev.l2 || n3 !== prev.l3) {
            console.log(new Date().toISOString(), `L2=${n2} L3=${n3}`);
            prev = { l2: n2, l3: n3 };
          }
        } catch { /* silent on transient errors */ }
      };
      const id = setInterval(() => { void poll(); }, 3000);
      await poll();
      await new Promise<void>((resolve) => {
        process.on("SIGINT", () => { clearInterval(id); resolve(); });
      });
      break;
    }

    default:
      console.log(USAGE);
  }
}
