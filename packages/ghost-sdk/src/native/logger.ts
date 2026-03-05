export type GhostLogLevel = "debug" | "info" | "warn" | "error";

export type GhostNativeLogger = {
  level: GhostLogLevel;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const ORDER: Record<GhostLogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createGhostNativeLogger(level: GhostLogLevel = "info"): GhostNativeLogger {
  const allow = (l: GhostLogLevel) => ORDER[l] >= ORDER[level];
  return {
    level,
    debug: (...a) => { if (allow("debug")) console.debug("[ghost][debug]", ...a); },
    info:  (...a) => { if (allow("info"))  console.info("[ghost][info]",  ...a); },
    warn:  (...a) => { if (allow("warn"))  console.warn("[ghost][warn]",  ...a); },
    error: (...a) => { if (allow("error")) console.error("[ghost][error]", ...a); },
  };
}
