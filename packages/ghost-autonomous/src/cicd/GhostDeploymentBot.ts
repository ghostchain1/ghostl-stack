import { ProcessRunner } from "@ghostchain/devkit";
import { Logger } from "@ghostchain/devkit";

const log = Logger.create("DeploymentBot");

export interface DeployResult {
  service: string;
  success: boolean;
  output?: string;
  error?: string;
}

export class GhostDeploymentBot {
  constructor(
    private readonly composeFile = "docker-compose.yml",
    private readonly cwd         = process.cwd(),
  ) {}

  async deploy(service: string): Promise<DeployResult> {
    log.info(`Deploying service: ${service}`);
    try {
      const out = await ProcessRunner.exec(
        "docker",
        ["compose", "-f", this.composeFile, "up", "-d", "--build", service],
        { cwd: this.cwd, stream: true },
      );
      log.info(`Service ${service} deployed`);
      return { service, success: true, output: out };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Deploy ${service} failed: ${msg}`);
      return { service, success: false, error: msg };
    }
  }

  async stop(service: string): Promise<void> {
    log.info(`Stopping service: ${service}`);
    await ProcessRunner.exec("docker", ["compose", "-f", this.composeFile, "stop", service], { cwd: this.cwd });
  }

  async restart(service: string): Promise<void> {
    log.info(`Restarting service: ${service}`);
    await ProcessRunner.exec("docker", ["compose", "-f", this.composeFile, "restart", service], { cwd: this.cwd });
  }

  async pull(service?: string): Promise<void> {
    const args = ["compose", "-f", this.composeFile, "pull"];
    if (service) args.push(service);
    await ProcessRunner.exec("docker", args, { cwd: this.cwd });
  }

  async logs(service: string, tail = 50): Promise<string> {
    return ProcessRunner.exec(
      "docker",
      ["compose", "-f", this.composeFile, "logs", "--no-color", "--tail", String(tail), service],
      { cwd: this.cwd },
    );
  }
}
