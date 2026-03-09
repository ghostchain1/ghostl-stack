/**
 * Ghost Infra Scaler — Entry Point
 * Port: SCALER_PORT ?? 7982
 */
import { buildApp } from "./app.js";
import { startMonitoring, stopMonitoring } from "./healthMonitor.js";

const PORT = Number(process.env.SCALER_PORT ?? 7982);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

startMonitoring();

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`ghost-infra-scaler listening at ${address}`);
});

process.on("SIGTERM", async () => {
  stopMonitoring();
  await app.close();
  process.exit(0);
});
