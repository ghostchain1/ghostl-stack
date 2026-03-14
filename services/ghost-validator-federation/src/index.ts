/**
 * Ghost Validator Federation — Entry Point
 * Port: VALIDATOR_FED_PORT ?? 7981
 */
import { buildApp } from "./app.js";

const PORT = Number(process.env.VALIDATOR_FED_PORT ?? 7981);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`ghost-validator-federation listening at ${address}`);
});

process.on("SIGTERM", async () => {
  await app.close();
  process.exit(0);
});
