/**
 * DependencyGraph — builds a module dependency tree from import statements.
 */
import * as fs from "fs";

export interface DependencyNode {
  file:    string;
  imports: string[];
}

export class DependencyGraph {
  build(files: string[]): Map<string, DependencyNode> {
    const graph = new Map<string, DependencyNode>();

    for (const file of files) {
      const imports = this._extractImports(file);
      graph.set(file, { file, imports });
    }

    return graph;
  }

  private _extractImports(file: string): string[] {
    let source: string;
    try {
      source = fs.readFileSync(file, "utf8");
    } catch {
      return [];
    }

    const matches = source.matchAll(/^\s*import\s+.*?['"](.*?)['"]/gm);
    return [...matches].map(m => m[1]).filter(Boolean);
  }

  /** Returns all files importing a given module. */
  dependantsOf(graph: Map<string, DependencyNode>, target: string): string[] {
    return [...graph.values()]
      .filter(n => n.imports.some(i => i.includes(target)))
      .map(n => n.file);
  }
}
