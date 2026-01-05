"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LokiClient = void 0;
const undici_1 = require("undici");
class LokiClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async query(query, limit = 100) {
        const url = new URL(`${this.baseUrl}/loki/api/v1/query`);
        url.searchParams.set('query', query);
        url.searchParams.set('limit', String(limit));
        const res = await (0, undici_1.fetch)(url.toString());
        if (!res.ok)
            throw new Error(`Loki query failed: ${res.status}`);
        const json = (await res.json());
        return json.data?.result || [];
    }
    async queryRange(query, startNs, endNs, limit = 100) {
        const url = new URL(`${this.baseUrl}/loki/api/v1/query_range`);
        url.searchParams.set('query', query);
        url.searchParams.set('start', String(startNs));
        url.searchParams.set('end', String(endNs));
        url.searchParams.set('limit', String(limit));
        const res = await (0, undici_1.fetch)(url.toString());
        if (!res.ok)
            throw new Error(`Loki range query failed: ${res.status}`);
        const json = (await res.json());
        return json.data?.result || [];
    }
}
exports.LokiClient = LokiClient;
