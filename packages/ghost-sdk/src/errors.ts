/**
 * GhostStack SDK error hierarchy.
 */

/** Thrown when a routing decision violates GhostStack law. */
export class GhostRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhostRoutingError";
  }
}

/** Thrown when all RPCs for a layer are unavailable. */
export class GhostRpcUnavailableError extends Error {
  constructor(layer: string) {
    super(`All RPC endpoints for layer ${layer} are unavailable.`);
    this.name = "GhostRpcUnavailableError";
  }
}

/** Thrown when a quorum read cannot achieve consensus. */
export class GhostQuorumError extends Error {
  constructor(message = "Quorum read failed") {
    super(message);
    this.name = "GhostQuorumError";
  }
}
