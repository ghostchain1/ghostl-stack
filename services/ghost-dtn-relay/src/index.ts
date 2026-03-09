/**
 * ghost-dtn-relay — Entry Point
 * Port: DTN_PORT ?? 7983
 */
import { buildApp } from "./app.js";
import { startExpiryLoop } from "./bundleStore.js";

const PORT = Number(process.env.DTN_PORT ?? 7983);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = buildApp();
const expiryTimer = startExpiryLoop();

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`ghost-dtn-relay listening at ${address}`);
});

process.on("SIGTERM", async () => {
  clearInterval(expiryTimer);
  await app.close();
  process.exit(0);
});
