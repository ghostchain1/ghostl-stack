import winston from "winston";
import path    from "path";
import fs      from "fs";

const DOCKER_LOG_DIR = "/app/logs";
const LOCAL_LOG_DIR  = path.join(__dirname, "../../logs");
const logDir = fs.existsSync(DOCKER_LOG_DIR) ? DOCKER_LOG_DIR : LOCAL_LOG_DIR;
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const extras = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
      return `${timestamp} [${level.toUpperCase()}] ${message}${extras}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logDir, "see.log"), maxsize: 10_485_760, maxFiles: 5 }),
  ],
});

export default logger;
