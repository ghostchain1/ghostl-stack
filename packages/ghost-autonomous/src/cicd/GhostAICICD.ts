import { Logger } from "@ghostchain/devkit";

const log = Logger.create("AICICD");

export interface PipelineStage {
  name: string;
  steps: string[];
}

export interface Pipeline {
  name: string;
  stages: PipelineStage[];
}

export class GhostAICICD {
  buildPipeline(targets: string[] = ["contracts", "api", "web"]): Pipeline {
    const stages: PipelineStage[] = [];

    stages.push({ name: "checkout",      steps: ["actions/checkout@v4"] });
    stages.push({ name: "setup",         steps: ["actions/setup-node@v4 (node 22)"] });
    stages.push({ name: "install",       steps: ["npm ci"] });

    if (targets.includes("contracts")) {
      stages.push({
        name: "contracts",
        steps: [
          "forge build --sizes",
          "forge test -vvv",
          "forge snapshot",
        ],
      });
    }

    if (targets.includes("api") || targets.includes("web")) {
      stages.push({
        name: "lint",
        steps: ["eslint . --max-warnings 0", "tsc --noEmit"],
      });
      stages.push({
        name: "build",
        steps: targets.map((t) => `npm run build --workspace=apps/${t}`),
      });
    }

    stages.push({
      name: "security",
      steps: [
        "node scripts/check-deprecations.mjs",
        "npm audit --audit-level=high",
        "trivy fs --exit-code 1 .",
      ],
    });

    stages.push({ name: "docker", steps: ["docker compose build --no-cache"] });

    log.info(`Pipeline built: ${stages.map((s) => s.name).join(" → ")}`);
    return { name: "ghostchain-ci", stages };
  }
}
