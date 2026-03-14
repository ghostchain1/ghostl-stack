import { buildApp }                from "./app.js";
import { runMultichainController } from "./multichain-core.js";

const PORT = parseInt(process.env["MULTICHAIN_CONTROLLER_PORT"] ?? "7950", 10);
const HOST = process.env["MULTICHAIN_CONTROLLER_HOST"] ?? "0.0.0.0";

async function main(): Promise<void> {
  const app = await buildApp();

  await app.listen({ port: PORT, host: HOST });
  console.log(`[ghost-multichain-controller] HTTP server listening on ${HOST}:${PORT}`);

  // Run the autonomous monitoring loop in the background (non-blocking).
  runMultichainController().catch(err => {
    console.error("[ghost-multichain-controller] fatal controller error:", err);
    process.exit(1);
  });
}

main().catch(err => {
  console.error("[ghost-multichain-controller] startup error:", err);
  process.exit(1);
});
