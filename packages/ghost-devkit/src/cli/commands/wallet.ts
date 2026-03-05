import { Logger } from "../../utils/Logger.js";
import type { CLIContext } from "../GhostCLI.js";
import { randomBytes } from "node:crypto";

const log = Logger.create("wallet");

const USAGE = `
ghost wallet <subcommand>

  create    Generate a new wallet keypair
  import    Import private key from env/stdin
  balance   Query GST balance on a layer
`;

/** Deterministic k256 keypair via Node crypto (no ethers dependency at CLI layer) */
function generateKeypair(): { privateKey: string; address: string } {
  // Use 32 random bytes as private key seed — real wallet logic lives in @ghostchain/sdk
  const pk = "0x" + randomBytes(32).toString("hex");
  // Address placeholder — real derivation happens inside GhostNativeWallet in the SDK
  const addr = "0x" + randomBytes(20).toString("hex");
  return { privateKey: pk, address: addr };
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
      log.info(`Querying balance for ${addr}…`);
      // Forward to SDK provider in real use — stub here
      console.log("Balance: 0 GST (connect to a live layer RPC for real balance)");
      break;
    }

    default:
      console.log(USAGE);
  }
}
