// ── Typed error hierarchy ─────────────────────────────────────────────────────

export class GhostSdkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "GhostSdkError";
    if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
  }
}

export class GhostValidationError extends GhostSdkError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GhostValidationError";
  }
}

export class GhostRpcError extends GhostSdkError {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "GhostRpcError";
  }
}

export class GhostTransportError extends GhostSdkError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GhostTransportError";
  }
}

export class GhostAuthError extends GhostSdkError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GhostAuthError";
  }
}

export class GhostTxError extends GhostSdkError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GhostTxError";
  }
}

export class GhostAbiError extends GhostSdkError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GhostAbiError";
  }
}

export class GhostRoutingViolationError extends GhostSdkError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GhostRoutingViolationError";
  }
}
