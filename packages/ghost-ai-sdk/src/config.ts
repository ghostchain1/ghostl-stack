// ── Layer / Endpoint types ────────────────────────────────────────────────────

export type GhostLayer = "L1" | "L2" | "L3";

export type RpcEndpoint = {
  http:      string;
  ws?:       string;
  chainId?:  number;
  name?:     string;
};

// ── Central config ────────────────────────────────────────────────────────────

export type GhostStackConfig = {
  /**
   * Routing-law enforcement.
   * L2/L3 may ONLY talk upstream via GhostChain coordination.
   * Keep `enforceGhostOnlyUpstream: true` in production.
   */
  policy: {
    enforceGhostOnlyUpstream: boolean;
    /** Enforced hop order — default ["L3","L2","L1"]. */
    routingPath: GhostLayer[];
  };

  rpc: {
    L1: RpcEndpoint;
    L2: RpcEndpoint;
    L3: RpcEndpoint;
  };

  ghostBrain: {
    /** ws(s)://ghostbrain-core:PORT/ws */
    wsUrl:     string;
    apiKey?:   string;
    clientId?: string;
  };

  swarm?: {
    nodeId:        string;
    /** e.g. "ghoststack-core" */
    group:         string;
    heartbeatMs?:  number;
  };

  monitoring?: {
    validators: Array<{
      id:          string;
      rpcHttp:     string;
      /** e.g. http://validator:9100/metrics */
      metricsUrl?: string;
    }>;
  };
};
