import { withDockerAccess } from "./docker_access.ts";

export type RolloutStrategy = "canary" | "blue-green" | "recreate";

export interface RolloutPlanInput {
  composeFile: string;
  service: string;
  strategy: RolloutStrategy;
  rollbackImage?: string;
}

export interface RolloutPlan {
  strategy: RolloutStrategy;
  applyCommands: string[];
  verifyCommands: string[];
  rollbackCommands: string[];
}

export function buildRolloutPlan(input: RolloutPlanInput): RolloutPlan {
  const compose = `docker compose -f ${input.composeFile}`;
  const verifyCommands = [
    withDockerAccess(`${compose} ps ${input.service}`),
    withDockerAccess(`${compose} logs --tail=120 ${input.service}`),
  ];

  if (input.strategy === "canary") {
    return {
      strategy: "canary",
      applyCommands: [
        withDockerAccess(
          `${compose} up -d --no-deps --scale ${input.service}=2 ${input.service}`,
        ),
      ],
      verifyCommands,
      rollbackCommands: [
        withDockerAccess(
          `${compose} up -d --no-deps --scale ${input.service}=1 ${input.service}`,
        ),
      ],
    };
  }

  if (input.strategy === "blue-green") {
    const green = `${input.service}-green`;
    return {
      strategy: "blue-green",
      applyCommands: [
        withDockerAccess(`${compose} up -d --no-deps ${green}`),
        withDockerAccess(`${compose} stop ${input.service}`),
      ],
      verifyCommands: [...verifyCommands, withDockerAccess(`${compose} ps ${green}`)],
      rollbackCommands: [
        withDockerAccess(`${compose} stop ${green}`),
        withDockerAccess(`${compose} up -d --no-deps ${input.service}`),
      ],
    };
  }

  const rollbackImage = input.rollbackImage
    ? [
        withDockerAccess(`${compose} pull ${input.service}`),
        withDockerAccess(`${compose} up -d --no-deps ${input.service}`),
      ]
    : [withDockerAccess(`${compose} up -d --no-deps --force-recreate ${input.service}`)];
  return {
    strategy: "recreate",
    applyCommands: [
      withDockerAccess(`${compose} up -d --no-deps --force-recreate ${input.service}`),
    ],
    verifyCommands,
    rollbackCommands: rollbackImage,
  };
}
