import { buildApp }             from "./app.js";
import { runInfraController }   from "./controller-core.js";

const PORT = parseInt(process.env["INFRA_CONTROLLER_PORT"] ?? "7940", 10);
const HOST = process.env["INFRA_CONTROLLER_HOST"] ?? "0.0.0.0";

async function main(): Promise<void> {
  const app = await buildApp();

  await app.listen({ port: PORT, host: HOST });
  console.log(`[ghost-infra-controller] HTTP server listening on ${HOST}:${PORT}`);

  // Run the infrastructure control loop in the background (non-blocking).
  runInfraController().catch(err => {
    console.error("[ghost-infra-controller] fatal controller error:", err);
    process.exit(1);
  });
}

main().catch(err => {
  console.error("[ghost-infra-controller] startup error:", err);
  process.exit(1);
});
