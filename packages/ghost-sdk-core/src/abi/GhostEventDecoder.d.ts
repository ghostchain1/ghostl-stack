import type { GhostABIFragment, GhostLog } from "../types";
export interface DecodedEvent {
    name: string;
    signature: string;
    args: Record<string, unknown>;
    log: GhostLog;
}
export declare class GhostEventDecoder {
    private coder;
    private eventMap;
    constructor(abi: GhostABIFragment[]);
    decode(log: GhostLog): DecodedEvent;
    private decodeWord;
}
