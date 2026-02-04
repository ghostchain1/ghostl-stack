export function log(msg: string) {
  process.stdout.write(`[ghost-helper] ${msg}\n`);
}

export function warn(msg: string) {
  process.stderr.write(`[ghost-helper][WARN] ${msg}\n`);
}

export function err(msg: string) {
  process.stderr.write(`[ghost-helper][ERROR] ${msg}\n`);
}
