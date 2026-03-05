import { Logger } from "@ghostchain/devkit";
import { GhostAICICD } from "./GhostAICICD.js";
import type { Pipeline } from "./GhostAICICD.js";

const log = Logger.create("PipelineBuilder");

export class GhostPipelineBuilder {
  private readonly ci = new GhostAICICD();

  /** Generate a GitHub Actions YAML string from a pipeline model. */
  generate(targets?: string[]): string {
    const pipeline = this.ci.buildPipeline(targets);
    return this.toYAML(pipeline);
  }

  pipeline(targets?: string[]): Pipeline {
    return this.ci.buildPipeline(targets);
  }

  private toYAML(pipeline: Pipeline): string {
    const lines: string[] = [
      `name: ${pipeline.name}`,
      `on:`,
      `  push:`,
      `    branches: [main]`,
      `  pull_request:`,
      `    branches: [main]`,
      ``,
      `jobs:`,
      `  ci:`,
      `    runs-on: ubuntu-latest`,
      `    steps:`,
      `      - uses: actions/checkout@v4`,
    ];

    for (const stage of pipeline.stages) {
      if (stage.name === "checkout") continue; // already added above
      lines.push(`      # Stage: ${stage.name}`);
      for (const step of stage.steps) {
        if (step.startsWith("actions/")) {
          lines.push(`      - uses: ${step}`);
        } else {
          lines.push(`      - name: ${stage.name}`);
          lines.push(`        run: ${step}`);
        }
      }
    }

    log.info(`Generated YAML for pipeline "${pipeline.name}" with ${pipeline.stages.length} stages`);
    return lines.join("\n");
  }
}
