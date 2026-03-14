/**
 * Container Rebuilder
 *
 * Performs a full container rebuild cycle:
 *   1. Stop the container gracefully.
 *   2. Pull the latest image.
 *   3. Start the container.
 *
 * Security: all Docker CLI calls use execFile() with argument arrays.
 * Image names and container names are validated before use.
 */

import type { DockerController } from "../infrastructure/docker_controller.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RebuildConfig {
  /** Container name to rebuild. */
  containerName: string;
  /** Image to pull (e.g. "ghostchain/runtime:latest"). Optional — skips pull if absent. */
  image?: string;
  /** Seconds to wait after stop before pulling. Default: 5. */
  stopWaitSecs?: number;
}

export interface RebuildResult {
  containerName: string;
  stopped:       boolean;
  pulled:        boolean;
  started:       boolean;
  error?:        string;
  durationMs:    number;
}

// ---------------------------------------------------------------------------
// ContainerRebuilder
// ---------------------------------------------------------------------------

export class ContainerRebuilder {
  private readonly docker: DockerController;

  constructor(docker: DockerController) {
    this.docker = docker;
  }

  /**
   * Rebuild a container by stopping, optionally pulling a new image, then starting.
   * The container must already exist (created by docker-compose or equivalent).
   */
  async rebuild(config: RebuildConfig): Promise<RebuildResult> {
    const { containerName, image, stopWaitSecs = 5 } = config;
    const start = Date.now();

    const result: RebuildResult = {
      containerName,
      stopped: false,
      pulled:  false,
      started: false,
      durationMs: 0,
    };

    try {
      // 1. Stop.
      await this.docker.stopContainer(containerName);
      result.stopped = true;
      console.log(`[ContainerRebuilder] Stopped: ${containerName}`);

      // 2. Wait for graceful exit.
      await this.sleep(stopWaitSecs * 1_000);

      // 3. Pull latest image (optional).
      if (image) {
        await this.docker.pullImage(image);
        result.pulled = true;
        console.log(`[ContainerRebuilder] Pulled image: ${image}`);
      }

      // 4. Start.
      await this.docker.startContainer(containerName);
      result.started = true;
      console.log(`[ContainerRebuilder] Started: ${containerName}`);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      console.error(`[ContainerRebuilder] Rebuild failed for "${containerName}":`, result.error);
    }

    result.durationMs = Date.now() - start;
    return result;
  }

  /**
   * Rebuild multiple containers sequentially.
   * Failures in one container do not stop subsequent rebuilds.
   */
  async rebuildAll(configs: RebuildConfig[]): Promise<RebuildResult[]> {
    const results: RebuildResult[] = [];
    for (const cfg of configs) {
      results.push(await this.rebuild(cfg));
    }
    return results;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
