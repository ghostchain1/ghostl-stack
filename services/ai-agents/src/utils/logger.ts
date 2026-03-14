import winston from "winston";
import path from "path";
import fs from "fs";

const { combine, timestamp, json, colorize, simple } = winston.format;

const LOG_DIR = (() => {
  const preferred = "/app/logs";
  try { fs.mkdirSync(preferred, { recursive: true }); return preferred; } catch { /* not in Docker */ }
  const local = path.join(__dirname, "..", "..", "logs");
  fs.mkdirSync(local, { recursive: true });
  return local;
})();

const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: combine(timestamp(), json()),
  transports: [
    new winston.transports.Console({ format: combine(colorize(), simple()) }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, "gaan.log"),
      maxsize:  10 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

export default logger;
