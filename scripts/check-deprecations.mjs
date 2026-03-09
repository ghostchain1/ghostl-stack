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
const exceptionsPath = path.join(rootDir, 'security', 'audit-exceptions.json');
const nowIso = new Date().toISOString();

const artifactsDir = path.join(rootDir, 'artifacts');
await mkdir(artifactsDir, { recursive: true });

const report = {
  generatedAt: nowIso,
  items: [],
  summary: {
    failures: [],
    exceptions: {
      total: 0,
      expired: []
    }
  },
  checks: {
    npmLs: null,
    npmOutdated: null,
    npmAudit: null,
    exceptions: null
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

const parseJsonPayload = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { ok: false, error: new Error('empty-json') };
  const direct = safeJsonParse(raw);
  if (direct.ok) return direct;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return direct;
  return safeJsonParse(raw.slice(start, end + 1));
};

const extractGhsaId = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.match(/(GHSA-[A-Za-z0-9-]+)/i);
  return match ? match[1].toUpperCase() : null;
};

const normalizeException = (raw, index) => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || `exception-${index + 1}`);
  const type = raw.type === 'outdated' ? 'outdated' : 'audit';
  const pkg = typeof raw.package === 'string' ? raw.package.trim() : '';
  const advisoryId = typeof raw.advisory_id === 'string' ? raw.advisory_id.trim().toUpperCase() : undefined;
  const owner = typeof raw.owner === 'string' ? raw.owner.trim() : '';
  const rationale = typeof raw.rationale === 'string' ? raw.rationale.trim() : '';
  const createdAt = typeof raw.created_at === 'string' ? raw.created_at.trim() : '';
  const expiresAt = typeof raw.expires_at === 'string' ? raw.expires_at.trim() : '';
  if (!pkg || !owner || !rationale || !createdAt || !expiresAt) return null;
  return {
    id,
    type,
    package: pkg,
    advisoryId,
    owner,
    rationale,
    compensatingControls: Array.isArray(raw.compensating_controls)
      ? raw.compensating_controls.filter((item) => typeof item === 'string' && item.trim())
      : [],
    createdAt,
    expiresAt
  };
};

const loadExceptions = async () => {
  try {
    const raw = await readFile(exceptionsPath, 'utf8');
    const parsed = safeJsonParse(raw);
    if (!parsed.ok || !Array.isArray(parsed.data?.exceptions)) {
      return { exceptions: [], invalid: true };
    }
    const exceptions = parsed.data.exceptions
      .map((entry, index) => normalizeException(entry, index))
      .filter(Boolean);
    return { exceptions, invalid: false };
  } catch {
    return { exceptions: [], invalid: false };
  }
};

const isExpired = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return true;
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);
  return endOfDay.getTime() < Date.now();
};

const matchAuditException = (finding, exceptions) => {
  return exceptions.find((entry) => {
    if (entry.type !== 'audit') return false;
    if (entry.package !== finding.package) return false;
    if (!entry.advisoryId) return true;
    return finding.advisoryIds.includes(entry.advisoryId);
  });
};

const matchOutdatedException = (finding, exceptions) => {
  return exceptions.find((entry) => entry.type === 'outdated' && entry.package === finding.package);
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
  report.checks.npmOutdated = { code: result.code, findings: [] };
  const candidate = result.stdout.trim();
  if (!candidate) return;
  const parsed = parseJsonPayload(candidate);
  if (!parsed.ok || !parsed.data || typeof parsed.data !== 'object') {
    report.checks.npmOutdated.error = 'invalid-json';
    return;
  }
  const findings = Object.entries(parsed.data).map(([pkg, details]) => ({
    package: pkg,
    current: details?.current,
    wanted: details?.wanted,
    latest: details?.latest,
    location: details?.location
  }));
  report.checks.npmOutdated.findings = findings;
  report.checks.npmOutdated.raw = parsed.data;
};

const scanNpmAudit = async () => {
  if (SKIP_NPM_AUDIT) {
    report.checks.npmAudit = { code: 0, skipped: true, findings: [] };
    return;
  }
  const result = await runCommand('npm', ['audit', '--json']);
  report.checks.npmAudit = { code: result.code, timedOut: !!result.timedOut, findings: [] };
  const parsed = parseJsonPayload(result.stdout);
  if (!parsed.ok || !parsed.data || typeof parsed.data !== 'object') {
    report.checks.npmAudit.error = 'invalid-json';
    return;
  }
  const vulnerabilities = parsed.data?.vulnerabilities || {};
  const findings = [];
  for (const [pkg, entry] of Object.entries(vulnerabilities)) {
    const advisories = Array.isArray(entry?.via)
      ? entry.via
          .filter((viaEntry) => viaEntry && typeof viaEntry === 'object')
          .map((viaEntry) => {
            const advisoryId = extractGhsaId(viaEntry.url) || extractGhsaId(viaEntry.title) || undefined;
            return {
              advisoryId,
              url: viaEntry.url,
              title: viaEntry.title
            };
          })
      : [];
    const advisoryIds = advisories.map((advisory) => advisory.advisoryId).filter(Boolean);
    findings.push({
      package: pkg,
      severity: entry?.severity || 'unknown',
      advisoryIds,
      advisories
    });
  }
  report.checks.npmAudit.findings = findings;
  report.checks.npmAudit.raw = parsed.data;
};

await scanNpmLs();
await scanNpmOutdated();
await scanNpmAudit();
await scanFiles();

const { exceptions, invalid } = await loadExceptions();
const expiredExceptions = exceptions.filter((entry) => isExpired(entry.expiresAt));
const activeExceptions = exceptions.filter((entry) => !isExpired(entry.expiresAt));

report.checks.exceptions = {
  file: path.relative(rootDir, exceptionsPath),
  exists: exceptions.length > 0 || invalid,
  invalid,
  active: activeExceptions.length,
  expired: expiredExceptions.length
};

const auditFindings = Array.isArray(report.checks.npmAudit?.findings) ? report.checks.npmAudit.findings : [];
const outdatedFindings = Array.isArray(report.checks.npmOutdated?.findings) ? report.checks.npmOutdated.findings : [];

const auditUnallowlisted = auditFindings.filter((finding) => !matchAuditException(finding, activeExceptions));
const outdatedUnallowlisted = outdatedFindings.filter((finding) => !matchOutdatedException(finding, activeExceptions));

const summaryRows = [];
summaryRows.push(
  ['check', 'status', 'details'],
  ['deprecated-patterns', report.items.length > 0 ? 'FAIL' : 'PASS', `${report.items.length} item(s)`],
  [
    'npm-audit',
    auditUnallowlisted.length === 0 &&
      ((report.checks.npmAudit?.code ?? 0) === 0 ||
        !!report.checks.npmAudit?.skipped ||
        auditFindings.length > 0)
      ? 'PASS'
      : 'FAIL',
    `${auditFindings.length} finding(s), ${auditUnallowlisted.length} unallowlisted`
  ],
  [
    'npm-outdated',
    outdatedUnallowlisted.length === 0 ? 'PASS' : 'FAIL',
    `${outdatedFindings.length} package(s), ${outdatedUnallowlisted.length} unallowlisted`
  ],
  ['exceptions', expiredExceptions.length === 0 && !invalid ? 'PASS' : 'FAIL', `${activeExceptions.length} active, ${expiredExceptions.length} expired`]
);

const pad = (value, len) => `${value}`.padEnd(len, ' ');
const colWidths = [0, 1, 2].map((idx) => Math.max(...summaryRows.map((row) => `${row[idx]}`.length)));
console.log('\nDependency Gate Summary');
for (const row of summaryRows) {
  console.log(`${pad(row[0], colWidths[0])} | ${pad(row[1], colWidths[1])} | ${row[2]}`);
}

if (report.items.length > 0) report.summary.failures.push('deprecated-patterns');
if (invalid) report.summary.failures.push('exceptions-invalid');
if (expiredExceptions.length > 0) report.summary.failures.push('exceptions-expired');
// Always fail on unallowlisted audit findings.
// Also fail conservatively when npm-audit exited non-zero but produced no parseable
// findings — this signals a parse error or tool crash and we must not silently pass.
if (auditUnallowlisted.length > 0) report.summary.failures.push('npm-audit');
else if (
  (report.checks.npmAudit?.code ?? 0) !== 0 &&
  !report.checks.npmAudit?.skipped &&
  auditFindings.length === 0
)
  report.summary.failures.push('npm-audit-parse-error');
if (outdatedUnallowlisted.length > 0) report.summary.failures.push('npm-outdated');

report.summary.exceptions = {
  total: exceptions.length,
  expired: expiredExceptions.map((entry) => ({ id: entry.id, package: entry.package, expiresAt: entry.expiresAt }))
};
report.summary.unallowlisted = {
  audit: auditUnallowlisted,
  outdated: outdatedUnallowlisted
};

const reportPath = path.join(artifactsDir, 'deprecations.json');
const auditReportPath = path.join(artifactsDir, 'dependency-audit.json');
const outdatedReportPath = path.join(artifactsDir, 'dependency-outdated.json');
const exceptionsEvalPath = path.join(artifactsDir, 'dependency-exceptions-eval.json');

await writeFile(reportPath, JSON.stringify(report, null, 2));
await writeFile(
  auditReportPath,
  JSON.stringify(
    {
      generatedAt: nowIso,
      code: report.checks.npmAudit?.code ?? null,
      findings: auditFindings
    },
    null,
    2
  )
);
await writeFile(
  outdatedReportPath,
  JSON.stringify(
    {
      generatedAt: nowIso,
      code: report.checks.npmOutdated?.code ?? null,
      findings: outdatedFindings
    },
    null,
    2
  )
);
await writeFile(
  exceptionsEvalPath,
  JSON.stringify(
    {
      generatedAt: nowIso,
      invalid,
      exceptions,
      expired: expiredExceptions
    },
    null,
    2
  )
);

if (report.summary.failures.length > 0) {
  process.exit(1);
}
