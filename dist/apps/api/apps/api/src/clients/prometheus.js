"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrometheusClient = void 0;
const undici_1 = require("undici");
class PrometheusClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    buildUrl(path, params) {
        const url = new URL(`${this.baseUrl}${path}`);
        if (params) {
            Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        }
        return url.toString();
    }
    async query(query) {
        const res = await (0, undici_1.fetch)(this.buildUrl('/api/v1/query', { query }));
        if (!res.ok)
            throw new Error(`Prometheus query failed: ${res.status}`);
        const json = (await res.json());
        return json.data?.result || [];
    }
    async queryRange(query, startMs, endMs, stepSeconds = 15) {
        const params = {
            query,
            start: String(Math.floor(startMs / 1000)),
            end: String(Math.floor(endMs / 1000)),
            step: String(stepSeconds)
        };
        const res = await (0, undici_1.fetch)(this.buildUrl('/api/v1/query_range', params));
        if (!res.ok)
            throw new Error(`Prometheus range query failed: ${res.status}`);
        const json = (await res.json());
        return json.data?.result || [];
    }
    async alerts() {
        const res = await (0, undici_1.fetch)(this.buildUrl('/api/v1/alerts'));
        if (!res.ok)
            throw new Error(`Prometheus alerts failed: ${res.status}`);
        const json = (await res.json());
        return json.data?.alerts || [];
    }
}
exports.PrometheusClient = PrometheusClient;
