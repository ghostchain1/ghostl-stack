/**
 * GhostStack SDK error hierarchy.
 */
/** Thrown when a routing decision violates GhostStack law. */
export declare class GhostRoutingError extends Error {
    constructor(message: string);
}
/** Thrown when all RPCs for a layer are unavailable. */
export declare class GhostRpcUnavailableError extends Error {
    constructor(layer: string);
}
/** Thrown when a quorum read cannot achieve consensus. */
export declare class GhostQuorumError extends Error {
    constructor(message?: string);
}
//# sourceMappingURL=errors.d.ts.map