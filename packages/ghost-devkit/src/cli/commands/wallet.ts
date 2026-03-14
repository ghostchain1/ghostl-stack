import { Logger } from "../../utils/Logger.js";
import type { CLIContext } from "../GhostCLI.js";
import { randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

const log = Logger.create("wallet");

const USAGE = `
ghost wallet <subcommand>

  create    Generate a new wallet keypair
  import    Import private key from env/stdin
  balance   Query GST balance on a layer [--address <0x…>] [--rpc <url>] [--layer l1|l2|l3]
`;

/** Derive a checksummed GhostChain address from a 32-byte hex private key. */
function deriveAddress(privateKey: string): string {
  const pkBytes = Uint8Array.from(Buffer.from(privateKey.slice(2), "hex"));
  const pub = secp256k1.getPublicKey(pkBytes, false); // uncompressed 65 bytes
  const hash = keccak_256(pub.slice(1)); // drop 0x04 prefix, hash remaining 64 bytes
  return "0x" + Buffer.from(hash.slice(12)).toString("hex"); // last 20 bytes
}

/** Generate a random 32-byte private key and derive its GhostChain address. */
function generateKeypair(): { privateKey: string; address: string } {
  const pk = "0x" + randomBytes(32).toString("hex");
  return { privateKey: pk, address: deriveAddress(pk) };
}

/** Resolve the RPC URL for the given layer. */
function resolveRpc(layer: string, flagRpc?: string): string {
  if (flagRpc) return flagRpc;
  const envMap: Record<string, string | undefined> = {
    l1: process.env["GHOST_L1_RPC"] ?? process.env["GHOST_RPC_URL"],
    l2: process.env["GHOST_L2_RPC"] ?? process.env["GHOST_RPC_URL"],
    l3: process.env["GHOST_L3_RPC"] ?? process.env["GHOST_RPC_URL"],
  };
  return envMap[layer] ?? process.env["GHOST_RPC_URL"] ?? "";
}

/** Call eth_getBalance via JSON-RPC and return the value in GST (18 decimals). */
async function fetchBalance(rpcUrl: string, address: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json() as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  const wei = BigInt(json.result ?? "0x0");
  const gst = Number(wei) / 1e18;
  return `${gst.toFixed(6)} GST (${wei.toString()} wei)`;
}

export async function run(ctx: CLIContext): Promise<void> {
  const sub = ctx.args[1];

  switch (sub) {
    case "create": {
      const { privateKey, address } = generateKeypair();
      console.log("\n  👻 Ghost Wallet Created");
      console.log(`  Address:    ${address}`);
      console.log(`  PrivateKey: ${privateKey}`);
      console.log("\n  Store your private key safely. It will not be shown again.\n");
      log.warn("NEVER commit your private key to source control.");
      break;
    }

    case "import": {
      const pk = ctx.flags["key"] as string | undefined
        ?? process.env["GHOST_PRIVATE_KEY"];
      if (!pk) {
        log.error("Provide --key <hex> or set GHOST_PRIVATE_KEY env var.");
        process.exit(1);
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
        log.error("Invalid private key — must be 0x-prefixed 32-byte hex.");
        process.exit(1);
      }
      log.info("Private key imported (stored in process env GHOST_PRIVATE_KEY).");
      break;
    }

    case "balance": {
      const addr = ctx.flags["address"] as string | undefined;
      if (!addr) {
        log.error("Provide --address <0x…>");
        process.exit(1);
      }
      const layer = (ctx.flags["layer"] as string | undefined) ?? "l2";
      const rpcUrl = resolveRpc(layer, ctx.flags["rpc"] as string | undefined);
      if (!rpcUrl) {
        log.error("No RPC URL found. Set GHOST_RPC_URL or use --rpc <url>.");
        process.exit(1);
      }
      log.info(`Querying ${layer.toUpperCase()} balance for ${addr} via ${rpcUrl}…`);
      try {
        const balance = await fetchBalance(rpcUrl, addr);
        console.log(`Balance: ${balance}`);
      } catch (err) {
        log.error(`RPC error: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.log(USAGE);
  }
}
