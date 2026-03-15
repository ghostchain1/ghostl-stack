/**
 * RepoScanner — builds a full file map of the GhostStack repository.
 */
import * as fs   from "fs";
import * as path from "path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "logs"]);
const SKIP_EXTS = new Set([".lock", ".map", ".wasm", ".png", ".jpg", ".jpeg", ".gif", ".ico"]);

export interface ScannedFile {
  path:     string;
  ext:      string;
  sizeBytes: number;
}

export class RepoScanner {
  scan(dir: string): ScannedFile[] {
    const results: ScannedFile[] = [];
    this._walk(dir, results);
    return results;
  }

  private _walk(dir: string, acc: ScannedFile[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // permission denied or unreadable
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) this._walk(fullPath, acc);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!SKIP_EXTS.has(ext)) {
          const stat = fs.statSync(fullPath);
          acc.push({ path: fullPath, ext, sizeBytes: stat.size });
        }
      }
    }
  }
}
