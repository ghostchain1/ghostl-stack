/**
 * @file errors.ts
 * @module @ghostchain/ghostchain-util/errors
 *
 * Typed error classes for ghostchain-util operations.
 */

export class GhostUtilError extends Error {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "GhostUtilError";
    this.code = code;
  }
}

export class GhostAddressError extends GhostUtilError {
  constructor(message: string, cause?: unknown) {
    super("INVALID_ADDRESS", message, cause);
    this.name = "GhostAddressError";
  }
}

export class GhostHexError extends GhostUtilError {
  constructor(message: string, cause?: unknown) {
    super("INVALID_HEX", message, cause);
    this.name = "GhostHexError";
  }
}

export class GhostABIError extends GhostUtilError {
  constructor(message: string, cause?: unknown) {
    super("ABI_ERROR", message, cause);
    this.name = "GhostABIError";
  }
}

export class GhostSignatureError extends GhostUtilError {
  constructor(message: string, cause?: unknown) {
    super("SIGNATURE_ERROR", message, cause);
    this.name = "GhostSignatureError";
  }
}

export class GhostRLPError extends GhostUtilError {
  constructor(message: string, cause?: unknown) {
    super("RLP_ERROR", message, cause);
    this.name = "GhostRLPError";
  }
}

export class GhostUnitError extends GhostUtilError {
  constructor(message: string, cause?: unknown) {
    super("UNIT_ERROR", message, cause);
    this.name = "GhostUnitError";
  }
}
