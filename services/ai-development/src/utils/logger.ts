import winston from "winston";
import path from "path";
import fs from "fs";

function resolveLogDir(): string {
  const dockerPath = "/app/logs";
  try { fs.mkdirSync(dockerPath, { recursive: true }); return dockerPath; } catch {}
  const localPath = path.resolve(__dirname, "../../logs");
  fs.mkdirSync(localPath, { recursive: true });
  return localPath;
}

const logDir = resolveLogDir();

const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) }),
    new winston.transports.File({ filename: path.join(logDir, "ade.log"), maxsize: 10 * 1024 * 1024, maxFiles: 3 }),
  ],
});

export default logger;
