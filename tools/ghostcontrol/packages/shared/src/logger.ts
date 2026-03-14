import pino, { type LoggerOptions } from "pino";

export function createLogger(
  options: LoggerOptions & { name?: string } = {},
): pino.Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    ...options,
  });
}

