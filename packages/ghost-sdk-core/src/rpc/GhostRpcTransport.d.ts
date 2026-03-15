export declare class GhostRpcTransport {
    private url;
    private timeout;
    constructor(url: string, options?: {
        timeoutMs?: number;
    });
    send(payload: unknown): Promise<unknown>;
}
