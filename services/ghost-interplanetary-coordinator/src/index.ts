import { buildApp } from "./app.js";

const PORT = Number(process.env.IP_COORD_PORT ?? process.env.PORT ?? 7985);

const { app, startProbing, scheduleOptimization } = buildApp();

app.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

startProbing();
scheduleOptimization();

process.on("SIGTERM", async () => {
  const { stopProbing } = await import("./nodeRegistry.js");
  const { stopOptimization } = await import("./routingOptimizer.js");
  stopProbing();
  stopOptimization();
  await app.close();
  process.exit(0);
});
