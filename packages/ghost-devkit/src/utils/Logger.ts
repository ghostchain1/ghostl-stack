export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",
  info:  "\x1b[36m",
  warn:  "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";
const BOLD  = "\x1b[1m";

function fmt(level: LogLevel, msg: string, ctx?: string): string {
  const ts  = new Date().toISOString();
  const pfx = ctx ? `[Ghost/${ctx}]` : "[Ghost]";
  const clr = COLORS[level];
  return `${clr}${BOLD}${pfx}${RESET} ${clr}${level.toUpperCase()}${RESET} ${ts} ${msg}`;
}

export class Logger {
  private minLevel: number;
  private ctx?: string;

  constructor(ctx?: string, minLevel: LogLevel = "info") {
    this.ctx      = ctx;
    this.minLevel = LEVELS[minLevel];
  }

  static create(ctx?: string, level?: LogLevel): Logger {
    return new Logger(ctx, level);
  }

  private emit(level: LogLevel, msg: string, ...args: unknown[]): void {
    if (LEVELS[level] < this.minLevel) return;
    const line = fmt(level, msg, this.ctx);
    if (level === "error") {
      console.error(line, ...args);
    } else if (level === "warn") {
      console.warn(line, ...args);
    } else {
      console.log(line, ...args);
    }
  }

  debug(msg: string, ...args: unknown[]): void { this.emit("debug", msg, ...args); }
  info(msg: string,  ...args: unknown[]): void { this.emit("info",  msg, ...args); }
  warn(msg: string,  ...args: unknown[]): void { this.emit("warn",  msg, ...args); }
  error(msg: string, ...args: unknown[]): void { this.emit("error", msg, ...args); }

  /** Static convenience helpers */
  static info(msg: string,  ...args: unknown[]): void { new Logger().emit("info",  msg, ...args); }
  static warn(msg: string,  ...args: unknown[]): void { new Logger().emit("warn",  msg, ...args); }
  static error(msg: string, ...args: unknown[]): void { new Logger().emit("error", msg, ...args); }
  static debug(msg: string, ...args: unknown[]): void { new Logger().emit("debug", msg, ...args); }
}
