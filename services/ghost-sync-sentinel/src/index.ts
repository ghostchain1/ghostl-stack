import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const cfg = loadConfig();
const app = await buildServer(cfg);

await app.listen({ port: Number(cfg.PORT), host: "0.0.0.0" });
app.log.info({ port: cfg.PORT }, "ghost-sync-sentinel listening");
