import { Logger } from "../utils/Logger.js";
const log = Logger.create("AuditReport");
export class GhostAuditReport {
    /** Generate a JSON-serialised audit report string. */
    generate(results) {
        const total = results.reduce((s, r) => s + r.issues.length, 0);
        const withIss = results.filter((r) => r.issues.length > 0).length;
        const summary = {
            scannedFiles: results.length,
            filesWithIssues: withIss,
            totalIssues: total,
            generatedAt: new Date().toISOString(),
            results,
        };
        log.info(`Report: ${results.length} files, ${total} total issues`);
        return JSON.stringify(summary, null, 2);
    }
    /** Print a human-readable version to stdout. */
    print(results) {
        const total = results.reduce((s, r) => s + r.issues.length, 0);
        console.log(`\n=== Ghost Audit Report ===`);
        console.log(`Files scanned : ${results.length}`);
        console.log(`Total issues  : ${total}\n`);
        for (const { file, issues } of results) {
            if (issues.length === 0)
                continue;
            console.log(`\x1b[33m${file}\x1b[0m (${issues.length} issue${issues.length > 1 ? "s" : ""})`);
            for (const iss of issues)
                console.log(`  \x1b[31m•\x1b[0m ${iss}`);
        }
        if (total === 0) {
            console.log("\x1b[32mNo issues found.\x1b[0m");
        }
    }
}
