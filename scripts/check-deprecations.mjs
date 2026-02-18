#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const DEFAULT_CMD_TIMEOUT_MS = Number(process.env.DEPRECATIONS_CMD_TIMEOUT_MS ?? 120000);
const SKIP_NPM_AUDIT = process.env.DEPRECATIONS_SKIP_AUDIT === '1';
const SKIP_FILE_SCAN = process.env.DEPRECATIONS_SKIP_FILE_SCAN === '1';

const artifactsDir = path.join(rootDir, 'artifacts');
await mkdir(artifactsDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  items: [],
  checks: {
    npmLs: null,
    npmOutdated: null,
    npmAudit: null
  }
};

const addItem = (item) => {
  report.items.push(item);
};

const runCommand = async (cmd, args, options = {}) => {
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_CMD_TIMEOUT_MS);
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: rootDir,
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const timedOut = error?.killed && error?.signal === 'SIGTERM';
    return {
      stdout: error.stdout ? String(error.stdout) : '',
      stderr: error.stderr ? String(error.stderr) : '',
      code: typeof error.code === 'number' ? error.code : 1,
      timedOut
    };
  }
};

const safeJsonParse = (value) => {
  try {
    return { ok: true, data: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error };
  }
};

const resolveWorkspacePaths = async () => {
  const rootPkg = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  const workspaceGlobs = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : [];
  const workspacePaths = [];

  for (const entry of workspaceGlobs) {
    if (entry.endsWith('/*')) {
      const base = entry.slice(0, -2);
      const basePath = path.join(rootDir, base);
      try {
        const entries = await readdir(basePath, { withFileTypes: true });
        for (const dirent of entries) {
          if (!dirent.isDirectory()) continue;
          const pkgPath = path.join(basePath, dirent.name, 'package.json');
          try {
            await stat(pkgPath);
            workspacePaths.push(path.join(base, dirent.name));
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    } else {
      workspacePaths.push(entry);
    }
  }

  const workspaces = [];
  for (const workspacePath of workspacePaths) {
    const pkgPath = path.join(rootDir, workspacePath, 'package.json');
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
      if (pkg?.name) {
        workspaces.push({ name: pkg.name, path: workspacePath, pkg });
      }
    } catch {
      continue;
    }
  }

  return workspaces;
};

const workspaces = await resolveWorkspacePaths();
const workspaceByName = new Map(workspaces.map((w) => [w.name, w]));
const nextWorkspaceNames = new Set(
  workspaces.filter((w) => w.pkg?.dependencies?.next || w.pkg?.devDependencies?.next).map((w) => w.name)
);

const workspaceForPath = (relativePath) => {
  const sorted = [...workspaces].sort((a, b) => b.path.length - a.path.length);
  for (const workspace of sorted) {
    if (relativePath === workspace.path || relativePath.startsWith(`${workspace.path}/`)) {
      return workspace.name;
    }
  }
  return 'root';
};

const listFiles = async (dir, collected) => {
  const relativeDir = path.relative(rootDir, dir);
  if (relativeDir.startsWith('infra/ghostchain/data') || relativeDir.startsWith('infra/ghostchain/logs')) {
    return;
  }
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skipDirs = new Set([
        'node_modules',
        '.git',
        'dist',
        'out',
        'coverage',
        'cache',
        'artifacts',
        'tmp',
        'data',
        'logs',
        'chaindata'
      ]);
      if (skipDirs.has(entry.name) || entry.name === '.next' || entry.name.startsWith('.next-')) {
        continue;
      }
      await listFiles(path.join(dir, entry.name), collected);
    } else if (entry.isFile()) {
      collected.push(path.join(dir, entry.name));
    }
  }
};

const scanFiles = async () => {
  if (SKIP_FILE_SCAN) {
    report.checks.fileScan = { skipped: true };
    return;
  }
  const files = [];
  const rootFiles = ['package.json', 'tsconfig.base.json'];
  for (const file of rootFiles) {
    try {
      await stat(path.join(rootDir, file));
      files.push(path.join(rootDir, file));
    } catch {
      continue;
    }
  }

  const scanRoots = ['apps', 'packages', 'services', 'core-service', 'scripts'];
  for (const scanRoot of scanRoots) {
    try {
      await stat(path.join(rootDir, scanRoot));
      await listFiles(path.join(rootDir, scanRoot), files);
    } catch {
      continue;
    }
  }

  const scanExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
  const codePatterns = [
    {
      id: 'node-buffer-constructor',
      regex: /\bnew Buffer\b|\bBuffer\s*\(/,
      category: 'code',
      replacement: 'Buffer.from/alloc',
      action: 'fix'
    },
    {
      id: 'node-fs-exists',
      regex: /\bfs\.exists\s*\(/,
      category: 'code',
      replacement: 'fs.stat/fs.access',
      action: 'fix'
    },
    {
      id: 'node-util-isarray',
      regex: /\butil\.is(Array|Date|RegExp|Error)\s*\(/,
      category: 'code',
      replacement: 'Array.isArray or instanceof checks',
      action: 'fix'
    },
    {
      id: 'node-process-binding',
      regex: /\bprocess\.binding\s*\(/,
      category: 'code',
      replacement: 'public Node.js APIs',
      action: 'fix'
    },
    {
      id: 'node-domain-module',
      regex: /\bfrom\s+['"]domain['"]|\brequire\(['"]domain['"]\)/,
      category: 'code',
      replacement: 'AsyncLocalStorage',
      action: 'fix'
    },
    {
      id: 'node-sys-module',
      regex: /\bfrom\s+['"]sys['"]|\brequire\(['"]sys['"]\)/,
      category: 'code',
      replacement: 'node:util',
      action: 'fix'
    },
    {
      id: 'react-dom-render',
      regex: /\bReactDOM\.(render|hydrate)\s*\(/,
      category: 'code',
      replacement: 'createRoot/hydrateRoot',
      action: 'fix'
    },
    {
      id: 'react-find-dom-node',
      regex: /\bfindDOMNode\s*\(/,
      category: 'code',
      replacement: 'refs',
      action: 'fix'
    }
  ];

  const deprecatedTsOptions = {
    importsNotUsedAsValues: 'verbatimModuleSyntax',
    preserveValueImports: 'verbatimModuleSyntax'
  };

  for (const filePath of files) {
    const ext = path.extname(filePath);
    if (!scanExtensions.has(ext)) continue;

    const relPath = path.relative(rootDir, filePath);
    const baseName = path.basename(filePath);
    const workspaceName = workspaceForPath(relPath);

    if (nextWorkspaceNames.has(workspaceName) && /^middleware\./.test(baseName)) {
      // Next.js expects middleware at repo root. We enforce a proxy-file convention to keep the real logic isolated,
      // but do not flag files that already follow that convention.
      const contents = await readFile(filePath, 'utf8');
      const looksLikeProxy =
        /from\s+['"]\.\/proxy['"]/.test(contents) && /\bexport\s*\{\s*config\s*\}/.test(contents);
      if (!looksLikeProxy) {
        addItem({
          workspace: workspaceName,
          category: 'config',
          location: relPath,
          action: 'fix',
          replacement: 'proxy file convention'
        });
      }
      continue;
    }

    const contents = await readFile(filePath, 'utf8');
    const lines = contents.split(/\r?\n/);

    if (baseName.startsWith('tsconfig') && ext === '.json') {
      const parsed = safeJsonParse(contents);
      if (parsed.ok && parsed.data?.compilerOptions) {
        for (const [option, replacement] of Object.entries(deprecatedTsOptions)) {
          if (option in parsed.data.compilerOptions) {
            addItem({
              workspace: workspaceName,
              category: 'config',
              location: `${relPath}`,
              action: 'fix',
              replacement
            });
          }
        }
      }
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const pattern of codePatterns) {
        if (!pattern.regex.test(line)) continue;
        if (pattern.id === 'node-buffer-constructor') {
          if (line.includes('Buffer.from') || line.includes('Buffer.alloc') || line.includes('Buffer.allocUnsafe')) {
            continue;
          }
        }
        addItem({
          workspace: workspaceName,
          category: pattern.category,
          location: `${relPath}:${i + 1}`,
          action: pattern.action,
          replacement: pattern.replacement
        });
      }
    }
  }
};

const scanNpmLs = async () => {
  const result = await runCommand('npm', ['ls', '--workspaces', '--json']);
  report.checks.npmLs = { code: result.code };
  const parsed = safeJsonParse(result.stdout);
  if (!parsed.ok) {
    report.checks.npmLs.error = 'invalid-json';
    return;
  }
  const root = parsed.data;
  const dependencies = root?.dependencies || {};

  const walk = (node, workspaceName) => {
    if (!node || typeof node !== 'object') return;
    if (node.deprecated) {
      addItem({
        workspace: workspaceName,
        category: 'dep',
        location: `${node.name || 'unknown'}@${node.version || 'unknown'}`,
        action: 'upgrade',
        replacement: 'latest stable'
      });
    }
    const children = node.dependencies || {};
    for (const [childName, childNode] of Object.entries(children)) {
      walk({ name: childName, ...childNode }, workspaceName);
    }
  };

  for (const [depName, depNode] of Object.entries(dependencies)) {
    const workspaceName = workspaceByName.has(depName) ? depName : 'root';
    walk({ name: depName, ...depNode }, workspaceName);
  }
};

const scanNpmOutdated = async () => {
  const result = await runCommand('npm', ['outdated', '-ws', '--json']);
  report.checks.npmOutdated = { code: result.code };
  if (!result.stdout.trim()) return;
  const parsed = safeJsonParse(result.stdout);
  if (!parsed.ok) {
    report.checks.npmOutdated.error = 'invalid-json';
  }
};

const scanNpmAudit = async () => {
  if (SKIP_NPM_AUDIT) {
    report.checks.npmAudit = { code: 0, skipped: true };
    return;
  }
  const result = await runCommand('npm', ['audit', '--json']);
  report.checks.npmAudit = { code: result.code, timedOut: !!result.timedOut };
  const parsed = safeJsonParse(result.stdout);
  if (!parsed.ok) {
    report.checks.npmAudit.error = 'invalid-json';
  }
};

await scanNpmLs();
await scanNpmOutdated();
await scanNpmAudit();
await scanFiles();

const reportPath = path.join(artifactsDir, 'deprecations.json');
await writeFile(reportPath, JSON.stringify(report, null, 2));

const hasDeprecated = report.items.length > 0;
if (hasDeprecated) {
  process.exit(1);
}
