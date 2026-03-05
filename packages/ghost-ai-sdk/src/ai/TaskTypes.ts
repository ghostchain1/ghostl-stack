export type SwarmTaskKind = "audit" | "monitor" | "route" | "ops";

export interface SwarmTask {
  taskId:   string;
  kind:     SwarmTaskKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload:  Record<string, any>;
  priority?: 1 | 2 | 3 | 4 | 5;
}

export interface SwarmHeartbeat {
  nodeId:    string;
  timestamp: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta?:     Record<string, any>;
}

export interface LeaderElection {
  leaderId: string;
  term:     number;
}

export interface GhostWsMessage {
  id:    string;
  topic: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}

export interface GhostWsResponse {
  id:     string;
  ok:     boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  error?:  string;
}
