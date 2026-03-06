import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const DEFAULTS = {
    network: "l2",
    rpc: {
        l1: "http://127.0.0.1:18545",
        l2: "http://127.0.0.1:29547",
        l3: "http://127.0.0.1:39545",
    },
    deployment: {
        confirmations: 1,
        gasMultiplier: 1.2,
    },
    foundry: {
        projectRoot: "contracts",
        outDir: "out",
        scriptDir: "script",
    },
    validator: {
        minPeers: 3,
        restartOnLowPeers: true,
    },
    ghostbrainUrl: "http://127.0.0.1:8080",
};
export class ConfigLoader {
    configPath;
    static instance = null;
    config = { ...DEFAULTS };
    loaded = false;
    constructor(configPath) {
        this.configPath = configPath;
    }
    static getInstance(root) {
        const cfgPath = path.resolve(root ?? process.cwd(), "ghost.config.json");
        if (!ConfigLoader.instance) {
            ConfigLoader.instance = new ConfigLoader(cfgPath);
        }
        return ConfigLoader.instance;
    }
    /** Reset singleton (for testing) */
    static reset() { ConfigLoader.instance = null; }
    async load() {
        if (this.loaded)
            return this.config;
        try {
            await stat(this.configPath);
            const raw = await readFile(this.configPath, "utf8");
            const overrides = JSON.parse(raw);
            this.config = this.merge(DEFAULTS, overrides);
        }
        catch {
            // Config file missing — use defaults silently
        }
        this.loaded = true;
        return this.config;
    }
    get(key) {
        return this.config[key];
    }
    merge(base, override) {
        const out = { ...base };
        for (const [k, v] of Object.entries(override)) {
            if (v !== null && typeof v === "object" && !Array.isArray(v)
                && typeof out[k] === "object" && out[k] !== null) {
                out[k] = { ...out[k], ...v };
            }
            else {
                out[k] = v;
            }
        }
        return out;
    }
    static async loadFrom(root) {
        return ConfigLoader.getInstance(root).load();
    }
}
