// GVM — Logger (pino)
import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  name:  "gvm",
  level: config().LOG_LEVEL,
  redact: ["req.headers.authorization"],
});
