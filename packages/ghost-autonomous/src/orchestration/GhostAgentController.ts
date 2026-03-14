import { Logger } from "@ghostchain/devkit";

const log = Logger.create("AgentController");

export interface Agent {
  name: string;
  run(): Promise<void>;
}

export class GhostAgentController {
  private readonly agents: Agent[] = [];
  private running = false;

  register(agent: Agent): this {
    this.agents.push(agent);
    log.info(`Registered agent: ${agent.name}`);
    return this;
  }

  async start(intervalMs = 60_000): Promise<void> {
    if (this.running) return;
    this.running = true;
    log.info(`Starting ${this.agents.length} agent(s), interval=${intervalMs}ms`);

    const tick = async () => {
      await Promise.allSettled(
        this.agents.map((a) =>
          a.run().catch((err) =>
            log.error(`Agent ${a.name} failed: ${err instanceof Error ? err.message : String(err)}`),
          ),
        ),
      );
    };

    await tick();
    setInterval(() => { void tick(); }, intervalMs);
  }

  stop(): void {
    this.running = false;
    log.info("AgentController stopped");
  }

  list(): string[] {
    return this.agents.map((a) => a.name);
  }
}
