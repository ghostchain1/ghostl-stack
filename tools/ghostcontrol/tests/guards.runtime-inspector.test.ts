import assert from "node:assert/strict";
import test from "node:test";

import type { ShellCommandResult } from "../deploy/docker_access.ts";
import { inspectRuntimeContainers } from "../guards/runtime_inspector.ts";

test("inspects runtime security state for configured service", async () => {
  const fakeRunner = (command: string): ShellCommandResult => {
    if (command.includes("docker ps -aq --filter label=com.docker.compose.service=ghostcontrol-api")) {
      return { ok: true, output: "abc123\n", command, exitCode: 0 };
    }
    if (command.includes("docker inspect abc123")) {
      return {
        ok: true,
        output: JSON.stringify([
          {
            Name: "/compose-ghostcontrol-api-1",
            Config: {
              User: "1001:1001",
              Healthcheck: { Test: ["CMD", "true"] },
              Labels: { "com.docker.compose.service": "ghostcontrol-api" },
            },
            HostConfig: {
              Privileged: false,
              ReadonlyRootfs: true,
            },
          },
        ]),
        command,
        exitCode: 0,
      };
    }
    return { ok: false, output: "unexpected_command", command, exitCode: 1 };
  };

  const result = await inspectRuntimeContainers({
    serviceNames: ["ghostcontrol-api"],
    composeProject: "compose",
    runCommand: fakeRunner,
  });

  assert.equal(result.warnings.length, 0);
  assert.equal(result.containers.length, 1);
  assert.equal(result.containers[0]?.name, "ghostcontrol-api");
  assert.equal(result.containers[0]?.user, "1001:1001");
  assert.equal(result.containers[0]?.privileged, false);
  assert.equal(result.containers[0]?.healthcheck, true);
});

test("reports docker socket permission denials as runtime warnings", async () => {
  const fakeRunner = (command: string): ShellCommandResult => ({
    ok: false,
    output:
      "permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: connect: permission denied",
    command,
    exitCode: 1,
  });

  const result = await inspectRuntimeContainers({
    serviceNames: ["ghostcontrol-api"],
    runCommand: fakeRunner,
  });

  assert.equal(result.containers.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? "", /docker_socket_permission_denied/);
});

