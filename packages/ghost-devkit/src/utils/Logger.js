const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = {
    debug: "\x1b[90m",
    info: "\x1b[36m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
function fmt(level, msg, ctx) {
    const ts = new Date().toISOString();
    const pfx = ctx ? `[Ghost/${ctx}]` : "[Ghost]";
    const clr = COLORS[level];
    return `${clr}${BOLD}${pfx}${RESET} ${clr}${level.toUpperCase()}${RESET} ${ts} ${msg}`;
}
export class Logger {
    minLevel;
    ctx;
    constructor(ctx, minLevel = "info") {
        this.ctx = ctx;
        this.minLevel = LEVELS[minLevel];
    }
    static create(ctx, level) {
        return new Logger(ctx, level);
    }
    emit(level, msg, ...args) {
        if (LEVELS[level] < this.minLevel)
            return;
        const line = fmt(level, msg, this.ctx);
        if (level === "error") {
            console.error(line, ...args);
        }
        else if (level === "warn") {
            console.warn(line, ...args);
        }
        else {
            console.log(line, ...args);
        }
    }
    debug(msg, ...args) { this.emit("debug", msg, ...args); }
    info(msg, ...args) { this.emit("info", msg, ...args); }
    warn(msg, ...args) { this.emit("warn", msg, ...args); }
    error(msg, ...args) { this.emit("error", msg, ...args); }
    /** Static convenience helpers */
    static info(msg, ...args) { new Logger().emit("info", msg, ...args); }
    static warn(msg, ...args) { new Logger().emit("warn", msg, ...args); }
    static error(msg, ...args) { new Logger().emit("error", msg, ...args); }
    static debug(msg, ...args) { new Logger().emit("debug", msg, ...args); }
}
