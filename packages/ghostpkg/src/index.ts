// GhostPkg — GhostChain Package Manager
// Discovers, installs, and manages @ghostchain/* SDK packages.
// Wraps npm under the hood with GhostChain registry awareness.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

/** All first-party @ghostchain packages */
export const GHOST_PACKAGES = [
  'ghost-sdk',
  'ghost-sdk-core',
  'ghostos-sdk',
  'ghostnode-sdk',
  'ghostbridge-sdk',
  'ghostl2-sdk',
  'ghostl3-sdk',
  'ghostdefi-sdk',
  'ghostnft-sdk',
  'ghostgame-sdk',
  'ghostcloud-sdk',
  'ghostenterprise-sdk',
  'ghostmobile-sdk',
  'ghostforge',
  'ghostdeploy',
  'ghosttest',
  'ghostpkg',
  'ghostwallet',
  'ghost-ai-sdk',
  'ghost-nodes',
  'ghostchain-sdk',
  'ghost-federation-sdk',
  'routing-guard',
  'routing-law',
  'brand-enforcer',
  'ghostchain-cryptography',
  'pq-crypto',
] as const;

export type GhostPackageName = typeof GHOST_PACKAGES[number];

export interface GhostPkgInfo {
  name: string;
  version: string;
  description: string;
  dependencies: string[];
  ghostLayer?: 'l1' | 'l2' | 'l3' | 'all';
}

export interface GhostInstallResult {
  installed: string[];
  failed: string[];
  durationMs: number;
}

/**
 * GhostPkg — GhostChain package manager.
 *
 * @example
 * ```ts
 * import { GhostPkg } from '@ghostchain/ghostpkg';
 *
 * const pkg = new GhostPkg();
 * await pkg.install('ghost-defi');      // alias → @ghostchain/ghostdefi-sdk
 * await pkg.installAll(['ghost-sdk', 'ghostbridge-sdk']);
 * const info = pkg.info('ghostnft-sdk');
 * ```
 */
export class GhostPkg {
  private readonly cwd: string;

  constructor(opts: { cwd?: string } = {}) {
    this.cwd = opts.cwd ? resolve(opts.cwd) : process.cwd();
  }

  /** Install one or more @ghostchain packages */
  async install(...packages: string[]): Promise<GhostInstallResult> {
    const resolved = packages.map(p => this._resolve(p));
    const start = Date.now();
    const installed: string[] = [];
    const failed: string[] = [];

    for (const pkg of resolved) {
      try {
        await execFileAsync('npm', ['install', pkg], { cwd: this.cwd });
        installed.push(pkg);
        console.log(`[GhostPkg] Installed ${pkg}`);
      } catch (err) {
        failed.push(pkg);
        console.error(`[GhostPkg] Failed to install ${pkg}: ${String(err)}`);
      }
    }

    return { installed, failed, durationMs: Date.now() - start };
  }

  /** Install an array of packages */
  async installAll(packages: string[]): Promise<GhostInstallResult> {
    return this.install(...packages);
  }

  /** Uninstall a package */
  async uninstall(packageName: string): Promise<void> {
    const resolved = this._resolve(packageName);
    await execFileAsync('npm', ['uninstall', resolved], { cwd: this.cwd });
    console.log(`[GhostPkg] Uninstalled ${resolved}`);
  }

  /** Search for packages matching a query */
  search(query: string): string[] {
    const q = query.toLowerCase().replace(/^@ghostchain\//, '');
    return GHOST_PACKAGES.filter(p => p.includes(q)).map(p => `@ghostchain/${p}`);
  }

  /** Get info about a GhostChain package from installed package.json */
  async info(packageName: string): Promise<GhostPkgInfo | null> {
    const resolved = this._resolve(packageName);
    const pkgPath = resolve(this.cwd, 'node_modules', resolved, 'package.json');
    try {
      const raw = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        name?: string;
        version?: string;
        description?: string;
        dependencies?: Record<string, string>;
        keywords?: string[];
      };
      return {
        name:         pkg.name ?? resolved,
        version:      pkg.version ?? 'unknown',
        description:  pkg.description ?? '',
        dependencies: Object.keys(pkg.dependencies ?? {}),
        ghostLayer:   inferLayer(pkg.keywords ?? []),
      };
    } catch {
      return null;
    }
  }

  /** List all installed @ghostchain packages */
  async listInstalled(): Promise<string[]> {
    try {
      const raw = await readFile(resolve(this.cwd, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const all = { ...pkg.dependencies, ...pkg.devDependencies };
      return Object.keys(all).filter(k => k.startsWith('@ghostchain/'));
    } catch {
      return [];
    }
  }

  /** Print the GhostPkg package catalogue */
  catalogue(): void {
    console.log('\n[GhostPkg] GhostChain Package Catalogue:\n');
    console.log('  Core SDKs:');
    ['ghost-sdk', 'ghost-sdk-core', 'ghostchain-sdk'].forEach(p => console.log(`    @ghostchain/${p}`));
    console.log('\n  Layer SDKs:');
    ['ghostl2-sdk', 'ghostl3-sdk', 'ghostbridge-sdk', 'ghostnode-sdk'].forEach(p => console.log(`    @ghostchain/${p}`));
    console.log('\n  Application SDKs:');
    ['ghostdefi-sdk', 'ghostnft-sdk', 'ghostgame-sdk', 'ghostmobile-sdk'].forEach(p => console.log(`    @ghostchain/${p}`));
    console.log('\n  Enterprise & Infrastructure:');
    ['ghostcloud-sdk', 'ghostenterprise-sdk', 'ghostos-sdk', 'ghost-nodes'].forEach(p => console.log(`    @ghostchain/${p}`));
    console.log('\n  Developer Tools:');
    ['ghostforge', 'ghostdeploy', 'ghosttest', 'ghostpkg', 'brand-enforcer'].forEach(p => console.log(`    @ghostchain/${p}`));
    console.log('\n  Security:');
    ['ghostchain-cryptography', 'pq-crypto', 'routing-guard', 'routing-law'].forEach(p => console.log(`    @ghostchain/${p}`));
    console.log('');
  }

  /** Scaffold a ghost project's package.json with recommended GhostChain dependencies */
  async scaffoldPackageJson(projectName: string, packages: string[]): Promise<void> {
    const deps: Record<string, string> = {};
    for (const p of packages) deps[this._resolve(p)] = 'latest';

    const pkgJson = {
      name:    projectName,
      version: '1.0.0',
      type:    'module',
      scripts: { build: 'tsc', test: 'ghosttest run' },
      dependencies: deps,
    };

    await writeFile(resolve(this.cwd, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf-8');
    console.log(`[GhostPkg] Scaffolded package.json for ${projectName}`);
  }

  /** Resolve short name → full @ghostchain/<name> */
  private _resolve(packageName: string): string {
    if (packageName.startsWith('@ghostchain/')) return packageName;
    // Short aliases: 'ghost-defi' → @ghostchain/ghostdefi-sdk
    const aliasMap: Record<string, string> = {
      'ghost-defi':    'ghostdefi-sdk',
      'ghost-nft':     'ghostnft-sdk',
      'ghost-game':    'ghostgame-sdk',
      'ghost-bridge':  'ghostbridge-sdk',
      'ghost-mobile':  'ghostmobile-sdk',
      'ghost-cloud':   'ghostcloud-sdk',
      'ghost-node':    'ghostnode-sdk',
      'ghost-l2':      'ghostl2-sdk',
      'ghost-l3':      'ghostl3-sdk',
    };
    const mapped = aliasMap[packageName] ?? packageName;
    return `@ghostchain/${mapped}`;
  }
}

function inferLayer(keywords: string[]): GhostPkgInfo['ghostLayer'] {
  if (keywords.includes('l1')) return 'l1';
  if (keywords.includes('l2')) return 'l2';
  if (keywords.includes('l3')) return 'l3';
  return 'all';
}

export default GhostPkg;
