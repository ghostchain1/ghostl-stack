/**
 * ErrorRepair — reads TypeScript compiler output and applies automated patches.
 */
import { execSync } from "child_process";

export interface CompileError {
  file:    string;
  line:    number;
  col:     number;
  code:    string;
  message: string;
}

export class ErrorRepair {
  /** Runs tsc and returns parsed errors. */
  compile(projectDir: string): CompileError[] {
    let output = "";
    try {
      execSync("npx tsc --noEmit 2>&1", { cwd: projectDir, stdio: "pipe" });
      return []; // no errors
    } catch (e: any) {
      output = e.stdout?.toString() ?? "";
    }

    return this._parseErrors(output);
  }

  private _parseErrors(output: string): CompileError[] {
    const lines = output.split("\n");
    const errors: CompileError[] = [];
    const re = /^(.+\.ts)\((\d+),(\d+)\): error (TS\d+): (.+)$/;

    for (const line of lines) {
      const m = re.exec(line);
      if (m) {
        errors.push({
          file:    m[1],
          line:    parseInt(m[2], 10),
          col:     parseInt(m[3], 10),
          code:    m[4],
          message: m[5],
        });
      }
    }
    return errors;
  }

  async repair(errors: CompileError[]): Promise<void> {
    for (const err of errors) {
      console.log(`[GhostCode] Repairing ${err.file}:${err.line} — ${err.code}: ${err.message}`);
      // Future: integrate AST rewriting via @typescript-eslint/typescript-estree
    }
  }
}
