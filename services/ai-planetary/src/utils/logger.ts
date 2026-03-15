import winston from "winston";
import path    from "path";
import fs      from "fs";

const logDir = (() => {
  const docker = "/app/logs";
  try { fs.mkdirSync(docker, { recursive: true }); return docker; } catch {
    const local = path.join(__dirname, "../../logs");
    fs.mkdirSync(local, { recursive: true }); return local;
  }
})();

const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()} ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logDir, "pne.log"), maxsize: 10_000_000, maxFiles: 3 }),
  ],
});

export default logger;
