/**
 * ghost-bundle-engine — Entry Point
 * Port: BUNDLE_ENGINE_PORT ?? 7984
 */
import { buildApp } from "./app.js";

const PORT = Number(process.env.BUNDLE_ENGINE_PORT ?? 7984);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`ghost-bundle-engine listening at ${address}`);
});

process.on("SIGTERM", async () => {
  await app.close();
  process.exit(0);
});
