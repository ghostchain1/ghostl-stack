// ─────────────────────────────────────────────────────────────────────────────
// Ghost SDK Core – Custom Error Classes
// ─────────────────────────────────────────────────────────────────────────────

export class GhostRpcError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "GhostRpcError";
  }
}

export class GhostNetworkError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "GhostNetworkError";
  }
}

export class GhostTransactionError extends Error {
  constructor(message: string, public txHash?: string) {
    super(message);
    this.name = "GhostTransactionError";
  }
}

export class GhostABIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhostABIError";
  }
}

export class GhostWalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhostWalletError";
  }
}

export class GhostPolicyViolationError extends Error {
  constructor(
    message: string,
    public ruleId: string
  ) {
    super(message);
    this.name = "GhostPolicyViolationError";
  }
}

export class GhostBridgeError extends Error {
  constructor(message: string, public layer: "L1" | "L2" | "L3") {
    super(message);
    this.name = "GhostBridgeError";
  }
}

export class GhostFailoverExhaustedError extends Error {
  constructor(public attempts: number) {
    super(`All ${attempts} RPC endpoints exhausted`);
    this.name = "GhostFailoverExhaustedError";
  }
}
