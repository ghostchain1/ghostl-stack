/**
 * Ghost Federation Coordinator — Entry Point
 * Port: FEDERATION_PORT ?? 7980
 */
import { buildApp } from "./app.js";
import { regionRegistry } from "./regionRegistry.js";

const PORT = Number(process.env.FEDERATION_PORT ?? 7980);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

regionRegistry.startProbing();

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`ghost-federation-coordinator listening at ${address}`);
});

process.on("SIGTERM", async () => {
  regionRegistry.stopProbing();
  await app.close();
  process.exit(0);
});
