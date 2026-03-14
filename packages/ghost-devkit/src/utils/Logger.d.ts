export type LogLevel = "debug" | "info" | "warn" | "error";
export declare class Logger {
    private minLevel;
    private ctx?;
    constructor(ctx?: string, minLevel?: LogLevel);
    static create(ctx?: string, level?: LogLevel): Logger;
    private emit;
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    /** Static convenience helpers */
    static info(msg: string, ...args: unknown[]): void;
    static warn(msg: string, ...args: unknown[]): void;
    static error(msg: string, ...args: unknown[]): void;
    static debug(msg: string, ...args: unknown[]): void;
}
//# sourceMappingURL=Logger.d.ts.map