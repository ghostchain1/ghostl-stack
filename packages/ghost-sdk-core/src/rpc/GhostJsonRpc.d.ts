export declare class GhostJsonRpc {
    private id;
    private transport;
    constructor(url: string, options?: {
        timeoutMs?: number;
    });
    request<T = unknown>(method: string, params?: unknown[]): Promise<T>;
}
