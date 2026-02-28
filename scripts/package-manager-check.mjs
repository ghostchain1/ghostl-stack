#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const userAgent = String(process.env.npm_config_user_agent || '').trim();
const npmExecPath = String(process.env.npm_execpath || '').trim();

const isNpmUserAgent = userAgent.startsWith('npm/');
const isNpmExec = /npm-cli\.js$/.test(npmExecPath) || npmExecPath.includes('/npm/bin/');

if (!isNpmUserAgent && !isNpmExec) {
  console.error('This monorepo is npm-only. Use `npm ci` or `npm install` from repo root.');
  console.error(`Detected npm_config_user_agent="${userAgent || 'unknown'}"`);
  process.exit(1);
}

const forbiddenLockfiles = ['pnpm-lock.yaml', 'yarn.lock'].filter((file) => existsSync(path.join(rootDir, file)));
if (forbiddenLockfiles.length) {
  console.error(`Remove unsupported lockfile(s): ${forbiddenLockfiles.join(', ')}`);
  console.error('Only package-lock.json is supported in this repository.');
  process.exit(1);
}

if (!existsSync(path.join(rootDir, 'package-lock.json'))) {
  console.error('Missing package-lock.json. Run `npm install` once at repo root and commit the lockfile.');
  process.exit(1);
}
