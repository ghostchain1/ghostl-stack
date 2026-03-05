/**
 * @file src/agent/roles/observer.js
 * @description Observer role: read-only collection of repo + runtime metadata.
 * Output feeds the Diagnostician. Never executes writes.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config.js';

/**
 * Collect surface-level repo metadata.
 * @param {string} [root]
 * @returns {Promise<object>}
 */
export async function observe(root = config.repoRoot) {
  const meta = {
    role:        'observer',
    observedAt:  new Date().toISOString(),
    repoRoot:    root,
    nodeVersion: process.version,
    services:    [],
    contracts:   [],
    ciFiles:     [],
    dockerComposeFiles: [],
    packageJsonPaths:   [],
  };

  function walkShallow(dir, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (['node_modules', '.git', 'dist', 'cache', 'out', 'artifacts'].includes(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory() && depth === 0) {
        if (e.name === 'services')      meta.services.push(...listSubdirs(full));
        else if (e.name === 'contracts') meta.contracts.push(...listSubdirs(join(full, 'src')));
        walkShallow(full, depth + 1, maxDepth);
      } else if (e.isFile()) {
        if (e.name.startsWith('docker-compose')) meta.dockerComposeFiles.push(full);
        if (e.name === 'package.json')            meta.packageJsonPaths.push(full);
        if (full.includes('.github/workflows') && e.name.endsWith('.yml')) meta.ciFiles.push(full);
      }
    }
  }

  function listSubdirs(dir) {
    if (!existsSync(dir)) return [];
    try { return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); }
    catch { return []; }
  }

  walkShallow(root);
  return meta;
}
