"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrafanaClient = void 0;
const undici_1 = require("undici");
class GrafanaClient {
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }
    headers() {
        const headers = {};
        if (this.apiKey)
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        return headers;
    }
    async listDashboards() {
        const res = await (0, undici_1.fetch)(`${this.baseUrl}/api/search?query=&type=dash-db`, {
            headers: this.headers()
        });
        if (!res.ok)
            throw new Error(`Grafana search failed: ${res.status}`);
        const data = (await res.json());
        return data.map((d) => ({ id: d.id, uid: d.uid, title: d.title, url: `${this.baseUrl}${d.url}` }));
    }
}
exports.GrafanaClient = GrafanaClient;
