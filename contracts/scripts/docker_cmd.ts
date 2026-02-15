import { spawnSync } from "node:child_process";

export type DockerCmd = { cmd: string; args: string[]; mode: "docker" | "sudo" };

// Resolve a docker command usable on hosts where the user is not in the `docker`
// group (common on fresh Ubuntu VMs). Prefer `docker`, fall back to `sudo -n docker`.
export function resolveDockerCmd(): DockerCmd {
  const dockerBin = "docker";

  const probe = spawnSync(dockerBin, ["info"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (!probe.error && probe.status === 0) {
    return { cmd: dockerBin, args: [], mode: "docker" };
  }
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === "ENOENT") {
    return { cmd: dockerBin, args: [], mode: "docker" };
  }

  const sudoProbe = spawnSync("sudo", ["-n", "true"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (sudoProbe.error || sudoProbe.status !== 0) {
    return { cmd: dockerBin, args: [], mode: "docker" };
  }

  const sudoDockerProbe = spawnSync("sudo", ["-n", dockerBin, "info"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (!sudoDockerProbe.error && sudoDockerProbe.status === 0) {
    return { cmd: "sudo", args: ["-n", dockerBin], mode: "sudo" };
  }

  return { cmd: dockerBin, args: [], mode: "docker" };
}

