import winston from "winston";
import path from "path";

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) =>
      `[${timestamp}] [${level.toUpperCase()}] ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(process.cwd(), "ine.log"),
      maxsize:  10 * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
  ],
});
