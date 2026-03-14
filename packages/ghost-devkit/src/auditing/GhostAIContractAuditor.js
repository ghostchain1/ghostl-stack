import { readFileSync } from "node:fs";
import { Logger } from "../utils/Logger.js";
const log = Logger.create("AIContractAuditor");
/** A simple, dependency-free static analyser for Solidity source files. */
export class GhostAIContractAuditor {
    /** Returns a list of issue strings found in the Solidity source. */
    analyze(source) {
        const issues = [];
        this.check(issues, source, /tx\.origin/g, "Use of tx.origin (SWC-115) — prefer msg.sender");
        this.check(issues, source, /delegatecall/g, "delegatecall detected — verify storage layout compatibility");
        this.check(issues, source, /selfdestruct|suicide/g, "selfdestruct/suicide detected — highly destructive operation");
        this.check(issues, source, /\.call\{.*\}/g, "Low-level .call{} — ensure reentrancy guard and check return value");
        this.check(issues, source, /assembly\s*\{/g, "Inline assembly — manual review required");
        this.check(issues, source, /block\.timestamp/g, "block.timestamp usage — miner-manipulable within ~900s");
        this.check(issues, source, /block\.number/g, "block.number usage — chain-specific, validate assumptions");
        this.check(issues, source, /pragma\s+solidity\s+\^/g, "Floating pragma (^) — pin to exact version for production");
        this.check(issues, source, /public\s+\w+\s+\w+\s*;/g, "Public state variable — evaluate if exposure is intentional");
        this.check(issues, source, /revert\(\)/g, "Empty revert() — add reason string for better UX");
        this.check(issues, source, /\bunchecked\s*\{/g, "unchecked block — verify no overflow/underflow possible");
        this.check(issues, source, /abi\.encodePacked/g, "abi.encodePacked — hash collisions posible with multiple dynamic types");
        // Missing event emissions on state-changing functions (simple heuristic)
        if (/function\s+\w+\s*\(.*\)\s*(public|external)\s*(payable|)\s*\{/.test(source)) {
            if (!source.includes("emit ")) {
                issues.push("State-changing public/external function may be missing event emissions");
            }
        }
        log.debug(`Analyzed ${source.length} bytes → ${issues.length} issue(s)`);
        return issues;
    }
    analyzeFile(filePath) {
        const src = readFileSync(filePath, "utf8");
        return this.analyze(src);
    }
    check(out, src, re, msg) {
        if (re.test(src))
            out.push(msg);
    }
}
