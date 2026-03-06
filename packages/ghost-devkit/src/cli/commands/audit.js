import { Logger } from "../../utils/Logger.js";
import { GhostAuditEngine } from "../../auditing/GhostAuditEngine.js";
import { GhostAuditReport } from "../../auditing/GhostAuditReport.js";
import path from "node:path";
import { writeFile } from "node:fs/promises";
const log = Logger.create("audit");
export async function run(ctx) {
    const dir = ctx.args[1] ?? "contracts";
    const outFile = ctx.flags["out"];
    const abs = path.resolve(process.cwd(), dir);
    log.info(`Auditing contracts in: ${abs}`);
    const engine = new GhostAuditEngine();
    const results = await engine.run(abs);
    const report = new GhostAuditReport();
    const json = report.generate(results);
    if (outFile) {
        await writeFile(path.resolve(outFile), json, "utf8");
        log.info(`Report saved to: ${outFile}`);
    }
    else {
        console.log(json);
    }
    const totalIssues = results.reduce((n, r) => n + r.issues.length, 0);
    if (totalIssues > 0) {
        log.warn(`Found ${totalIssues} issue(s) across ${results.length} file(s).`);
        process.exit(1);
    }
    else {
        log.info("Audit passed — no issues found.");
    }
}
