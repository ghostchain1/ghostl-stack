export class GhostError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly meta?: unknown
  ) {
    super(message);
    this.name = "GhostError";
  }
}

export class PolicyViolationError extends GhostError {
  constructor(message: string, meta?: unknown) {
    super(message, "POLICY_VIOLATION", meta);
    this.name = "PolicyViolationError";
  }
}

export class GhostBrainError extends GhostError {
  constructor(message: string, meta?: unknown) {
    super(message, "GHOSTBRAIN_ERROR", meta);
    this.name = "GhostBrainError";
  }
}

export class AuditBlockedError extends GhostError {
  constructor(message: string, meta?: unknown) {
    super(message, "AUDIT_BLOCKED", meta);
    this.name = "AuditBlockedError";
  }
}
