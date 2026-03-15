import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
          const extra = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
          return `${timestamp} [${level}] ${message}${extra}`;
        })
      ),
    }),
  ],
});

export default logger;
