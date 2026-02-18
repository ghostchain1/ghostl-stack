import { spawnSync } from "node:child_process";

export interface ShellCommandResult {
  ok: boolean;
  output: string;
  command: string;
  exitCode: number | null;
}

function quoteForSingleShell(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function withDockerAccess(command: string): string {
  const quoted = quoteForSingleShell(command);
  return [
    "GHOST_DOCKER_SOCKET_GROUP=\"\"",
    "if [ -S /var/run/docker.sock ] && command -v stat >/dev/null 2>&1; then",
    "  GHOST_DOCKER_SOCKET_GROUP=$(stat -c '%G' /var/run/docker.sock 2>/dev/null || true)",
    "fi",
    "GHOST_DOCKER_GROUP_CANDIDATE=${DOCKER_SOCKET_GROUP:-${GHOST_DOCKER_SOCKET_GROUP:-${GHOST_DOCKER_GROUP:-}}}",
    "if command -v sg >/dev/null 2>&1 && [ -n \"$GHOST_DOCKER_GROUP_CANDIDATE\" ] && getent group \"$GHOST_DOCKER_GROUP_CANDIDATE\" >/dev/null 2>&1; then",
    `  sg "$GHOST_DOCKER_GROUP_CANDIDATE" -c ${quoted}`,
    "elif command -v sg >/dev/null 2>&1 && getent group docker >/dev/null 2>&1; then",
    `  sg docker -c ${quoted}`,
    "else",
    `  ${command}`,
    "fi",
  ].join("\n");
}

export function runShellCommand(command: string): ShellCommandResult {
  const result = spawnSync("bash", ["-lc", command], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return {
    ok: result.status === 0,
    output,
    command,
    exitCode: result.status,
  };
}

export function runDockerCommand(command: string): ShellCommandResult {
  return runShellCommand(withDockerAccess(command));
}
