import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "../utils/Logger.js";
import { GhostAIContractAuditor } from "./GhostAIContractAuditor.js";
const log = Logger.create("AuditEngine");
export class GhostAuditEngine {
    auditor = new GhostAIContractAuditor();
    /** Recursively audit all .sol files in `dir`. */
    async run(dir) {
        const files = this.findSolFiles(dir);
        log.info(`Auditing ${files.length} Solidity file(s) in ${dir}`);
        const results = [];
        for (const file of files) {
            try {
                const source = readFileSync(file, "utf8");
                const issues = this.auditor.analyze(source);
                results.push({ file, issues });
                if (issues.length > 0)
                    log.warn(`${file}: ${issues.length} issue(s)`);
            }
            catch (err) {
                log.error(`Could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
                results.push({ file, issues: [`Read error: ${err instanceof Error ? err.message : String(err)}`] });
            }
        }
        return results;
    }
    findSolFiles(dir) {
        const result = [];
        try {
            const entries = readdirSync(dir);
            for (const e of entries) {
                const full = join(dir, e);
                const stat = statSync(full);
                if (stat.isDirectory()) {
                    result.push(...this.findSolFiles(full));
                }
                else if (e.endsWith(".sol")) {
                    result.push(full);
                }
            }
        }
        catch { /* dir may not exist */ }
        return result;
    }
}
