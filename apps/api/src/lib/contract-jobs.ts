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

const dataDir = process.env.DATA_DIR || 'data';
const jobsDir = path.join(dataDir, 'contract-jobs');

const ensureDir = () => {
  fs.mkdirSync(jobsDir, { recursive: true });
};

const jobPath = (id: string) => path.join(jobsDir, `${id}.json`);
const logPath = (id: string) => path.join(jobsDir, `${id}.log`);

export const createContractJob = (input: {
  type: ContractJobStatus['type'];
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  meta?: Record<string, unknown>;
}) => {
  ensureDir();
  const id = crypto.randomUUID();
  const status: ContractJobStatus = {
    id,
    type: input.type,
    status: 'running',
    startedAt: new Date().toISOString(),
    command: input.command,
    args: input.args,
    cwd: input.cwd,
    meta: input.meta,
    logPath: logPath(id)
  };
  fs.writeFileSync(jobPath(id), JSON.stringify(status, null, 2));

  const out = fs.createWriteStream(logPath(id), { flags: 'a' });
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env || process.env,
    stdio: ['ignore', 'pipe', 'pipe']
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
