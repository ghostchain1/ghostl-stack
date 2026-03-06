import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Logger } from "../utils/Logger.js";
const log = Logger.create("DeploymentRegistry");
export class GhostDeploymentRegistry {
    entries = new Map();
    filePath;
    constructor(filePath = "deployments/registry.json") {
        this.filePath = resolve(filePath);
        this.load();
    }
    load() {
        if (!existsSync(this.filePath))
            return;
        try {
            const raw = readFileSync(this.filePath, "utf8");
            const arr = JSON.parse(raw);
            for (const e of arr)
                this.entries.set(this.key(e.name, e.network), e);
        }
        catch {
            log.warn(`Could not parse registry at ${this.filePath}`);
        }
    }
    key(name, network) {
        return `${network}:${name}`;
    }
    register(name, address, network = "unknown") {
        const entry = { name, address, network, timestamp: new Date().toISOString() };
        this.entries.set(this.key(name, network), entry);
        this.persist();
        log.info(`Registered ${name} @ ${address} (${network})`);
    }
    get(name, network = "unknown") {
        return this.entries.get(this.key(name, network));
    }
    getAddress(name, network = "unknown") {
        return this.get(name, network)?.address;
    }
    list(network) {
        const all = [...this.entries.values()];
        return network ? all.filter((e) => e.network === network) : all;
    }
    export() {
        return JSON.stringify(this.list(), null, 2);
    }
    persist() {
        try {
            writeFileSync(this.filePath, this.export(), "utf8");
        }
        catch {
            log.warn(`Could not persist registry to ${this.filePath}`);
        }
    }
}
