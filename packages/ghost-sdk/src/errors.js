"use strict";
/**
 * GhostStack SDK error hierarchy.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostQuorumError = exports.GhostRpcUnavailableError = exports.GhostRoutingError = void 0;
/** Thrown when a routing decision violates GhostStack law. */
class GhostRoutingError extends Error {
    constructor(message) {
        super(message);
        this.name = "GhostRoutingError";
    }
}
exports.GhostRoutingError = GhostRoutingError;
/** Thrown when all RPCs for a layer are unavailable. */
class GhostRpcUnavailableError extends Error {
    constructor(layer) {
        super(`All RPC endpoints for layer ${layer} are unavailable.`);
        this.name = "GhostRpcUnavailableError";
    }
}
exports.GhostRpcUnavailableError = GhostRpcUnavailableError;
/** Thrown when a quorum read cannot achieve consensus. */
class GhostQuorumError extends Error {
    constructor(message = "Quorum read failed") {
        super(message);
        this.name = "GhostQuorumError";
    }
}
exports.GhostQuorumError = GhostQuorumError;
