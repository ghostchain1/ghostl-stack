// SPDX-License-Identifier: MIT
// GhostChain · GhostBrain AI Contract Engine — Structured Logger

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const MIN_LEVEL: LogLevel = (process.env["LOG_LEVEL"] as LogLevel | undefined) ?? "info";

function _emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;
  const entry = {
    t:    new Date().toISOString(),
    lvl:  level,
    svc:  "ghost-ai-contract-engine",
    msg,
    ...meta,
  };
  const out = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    process.stderr.write(out + "\n");
  } else {
    process.stdout.write(out + "\n");
  }
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => _emit("debug", msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => _emit("info",  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => _emit("warn",  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => _emit("error", msg, meta),
};
