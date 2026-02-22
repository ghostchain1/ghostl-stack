import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

export type ContractJobStatus = {
  id: string;
  type: 'deploy' | 'tests' | 'formal';
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  command: string;
  args: string[];
  cwd: string;
  meta?: Record<string, unknown>;
  logPath: string;
};

// SECURITY: Whitelist of allowed commands to prevent command injection
const ALLOWED_COMMANDS = new Set(['npm', 'node', 'npx', 'hardhat', 'forge', 'slither', 'scribble', 'echidna', 'certora']);
const ALLOWED_CWD_PREFIXES = ['contracts', 'packages', 'apps', 'services', 'tools'];

const dataDir = process.env.DATA_DIR || 'data';
const jobsDir = path.join(dataDir, 'contract-jobs');

const ensureDir = () => {
  fs.mkdirSync(jobsDir, { recursive: true });
};

const jobPath = (id: string) => path.join(jobsDir, `${id}.json`);
const logPath = (id: string) => path.join(jobsDir, `${id}.log`);

// SECURITY: Validate command against whitelist
const validateCommand = (command: string): boolean => {
  const baseCommand = path.basename(command);
  return ALLOWED_COMMANDS.has(baseCommand);
};

// SECURITY: Validate working directory is within allowed paths
const validateCwd = (cwd: string): boolean => {
  const resolved = path.resolve(cwd);
  return ALLOWED_CWD_PREFIXES.some(prefix => resolved.includes(prefix));
};

// SECURITY: Sanitize arguments to prevent injection
const sanitizeArgs = (args: string[]): string[] => {
  return args.map(arg => {
    // Remove shell metacharacters
    return arg.replace(/[;&|`$(){}[\]\\]/g, '');
  });
};

export const createContractJob = (input: {
  type: ContractJobStatus['type'];
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  meta?: Record<string, unknown>;
}) => {
  // SECURITY: Validate command before execution
  if (!validateCommand(input.command)) {
    throw new Error(`Command not allowed: ${input.command}. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(', ')}`);
  }
  
  // SECURITY: Validate working directory
  if (!validateCwd(input.cwd)) {
    throw new Error(`Working directory not allowed: ${input.cwd}`);
  }
  
  // SECURITY: Sanitize arguments
  const sanitizedArgs = sanitizeArgs(input.args);

  ensureDir();
  const id = crypto.randomUUID();
  const status: ContractJobStatus = {
    id,
    type: input.type,
    status: 'running',
    startedAt: new Date().toISOString(),
    command: input.command,
    args: sanitizedArgs,
    cwd: input.cwd,
    meta: input.meta,
    logPath: logPath(id)
  };
  fs.writeFileSync(jobPath(id), JSON.stringify(status, null, 2));

  const out = fs.createWriteStream(logPath(id), { flags: 'a' });
  
  // SECURITY: Use shell: false and validated command
  const child = spawn(input.command, sanitizedArgs, {
    cwd: input.cwd,
    env: input.env || process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false // SECURITY: Disable shell to prevent injection
  });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);

  child.on('close', (code) => {
    const updated: ContractJobStatus = {
      ...status,
      status: code === 0 ? 'success' : 'failed',
      finishedAt: new Date().toISOString(),
      exitCode: code
    };
    fs.writeFileSync(jobPath(id), JSON.stringify(updated, null, 2));
    out.end();
  });

  return status;
};

export const readContractJob = (id: string) => {
  const file = jobPath(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ContractJobStatus;
};

export const readContractJobLog = (id: string, offset = 0) => {
  const file = logPath(id);
  if (!fs.existsSync(file)) return { text: '', nextOffset: offset };
  const stat = fs.statSync(file);
  const start = Math.max(0, offset);
  const end = stat.size;
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(end - start);
  fs.readSync(fd, buffer, 0, end - start, start);
  fs.closeSync(fd);
  return { text: buffer.toString('utf8'), nextOffset: end };
};
