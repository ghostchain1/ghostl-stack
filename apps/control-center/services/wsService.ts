// WebSocket service — connects to SCP live log stream
// Singleton socket with multi-subscriber support.

import { C3_CONFIG } from "@/config/ghostConfig";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id:      string;
  ts:      number;
  level:   LogLevel;
  service: string;
  message: string;
}

export type LogHandler = (entry: LogEntry) => void;

let socket: WebSocket | null = null;
const handlers = new Set<LogHandler>();

function parseFrame(raw: string): LogEntry {
  try {
    return JSON.parse(raw) as LogEntry;
  } catch {
    return {
      id:      crypto.randomUUID(),
      ts:      Date.now(),
      level:   "info",
      service: "ws",
      message: raw,
    };
  }
}

export function connectSocket(onLog?: LogHandler): void {
  if (typeof window === "undefined") return;
  if (onLog) handlers.add(onLog);

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(C3_CONFIG.ws.url);
  } catch {
    // WebSocket URL may not be reachable in dev — silently skip
    return;
  }

  socket.onopen = () => {
    console.info("[C3-WS] Connected to", C3_CONFIG.ws.url);
  };

  socket.onmessage = event => {
    const entry = parseFrame(event.data as string);
    handlers.forEach(h => h(entry));
  };

  socket.onerror = () => {
    // Swallow — connection refused is expected when SCP is offline
  };

  socket.onclose = () => {
    socket = null;
  };
}

export function disconnectSocket(handler?: LogHandler): void {
  if (handler) handlers.delete(handler);
  if (handlers.size === 0 && socket) {
    socket.close();
    socket = null;
  }
}

// Generate a synthetic log entry for display when WS is offline
export function makeSyntheticLog(service: string, message: string, level: LogLevel = "info"): LogEntry {
  return { id: crypto.randomUUID(), ts: Date.now(), level, service, message };
}
