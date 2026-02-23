const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '..', '..');
const entry = path.join(repoRoot, 'dist', 'apps', 'api', 'apps', 'api', 'src', 'server.js');

const env = {
  ...process.env,
  NODE_PATH: [path.join(appDir, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
};

const child = spawn(process.execPath, [entry], {
  cwd: appDir,
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
