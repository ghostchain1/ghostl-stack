import { runDockerCommand, type ShellCommandResult } from "../deploy/docker_access.ts";
import type { ContainerSecurityState } from "./invariants.ts";

export interface RuntimeInspectorInput {
  serviceNames: string[];
  composeProject?: string;
  runCommand?: (command: string) => ShellCommandResult;
}

export interface RuntimeInspectorResult {
  containers: ContainerSecurityState[];
  warnings: string[];
}

function buildContainerLookupCommand(service: string, composeProject?: string): string {
  const projectFilter = composeProject
    ? ` --filter label=com.docker.compose.project=${composeProject}`
    : "";
  return `docker ps -aq --filter label=com.docker.compose.service=${service}${projectFilter} | head -n 1`;
}

function buildInspectCommand(containerId: string): string {
  return `docker inspect ${containerId}`;
}

function classifyDockerError(output: string): string {
  if (/permission denied/i.test(output) && /docker\.sock|docker daemon socket/i.test(output)) {
    return "docker_socket_permission_denied";
  }
  if (/cannot connect to the docker daemon/i.test(output)) {
    return "docker_daemon_unreachable";
  }
  if (/no such container/i.test(output)) {
    return "container_not_found";
  }
  return "docker_command_failed";
}

function parseInspectOutput(
  output: string,
): { user?: string; privileged: boolean; healthcheck: boolean; readOnlyRootFs: boolean; name?: string } | null {
  const trimmed = output.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const container = parsed[0] as {
    Name?: string;
    Config?: { User?: string; Healthcheck?: unknown; Labels?: Record<string, string> };
    HostConfig?: { Privileged?: boolean; ReadonlyRootfs?: boolean };
  };

  const serviceName = container.Config?.Labels?.["com.docker.compose.service"];
  const user = typeof container.Config?.User === "string" && container.Config.User.length > 0
    ? container.Config.User
    : undefined;

  return {
    name: serviceName ?? container.Name?.replace(/^\/+/, ""),
    user,
    privileged: Boolean(container.HostConfig?.Privileged),
    healthcheck: container.Config?.Healthcheck != null,
    readOnlyRootFs: Boolean(container.HostConfig?.ReadonlyRootfs),
  };
}

function firstToken(value: string): string | undefined {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  return tokens[0];
}

export async function inspectRuntimeContainers(
  input: RuntimeInspectorInput,
): Promise<RuntimeInspectorResult> {
  const run = input.runCommand ?? runDockerCommand;
  const warnings: string[] = [];
  const containers: ContainerSecurityState[] = [];

  for (const serviceName of input.serviceNames) {
    const lookup = run(buildContainerLookupCommand(serviceName, input.composeProject));
    if (!lookup.ok) {
      warnings.push(
        `service=${serviceName}: lookup failed (${classifyDockerError(lookup.output || lookup.command)})`,
      );
      continue;
    }

    const containerId = firstToken(lookup.output ?? "");
    if (!containerId) {
      warnings.push(`service=${serviceName}: container_not_running`);
      continue;
    }

    const inspected = run(buildInspectCommand(containerId));
    if (!inspected.ok) {
      warnings.push(
        `service=${serviceName}: inspect failed (${classifyDockerError(inspected.output || inspected.command)})`,
      );
      continue;
    }

    const parsed = parseInspectOutput(inspected.output);
    if (!parsed) {
      warnings.push(`service=${serviceName}: inspect_parse_failed`);
      continue;
    }

    containers.push({
      name: serviceName,
      user: parsed.user,
      privileged: parsed.privileged,
      healthcheck: parsed.healthcheck,
      readOnlyRootFs: parsed.readOnlyRootFs,
    });
  }

  return { containers, warnings };
}
