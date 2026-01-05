export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertState = 'firing' | 'resolved';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  source: string;
  state: AlertState;
  firedAt: string;
  resolvedAt?: string;
  labels?: Record<string, string>;
  message?: string;
}

export interface LogEvent {
  source: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  time: string;
  labels?: Record<string, string>;
}
