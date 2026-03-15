/**
 * DockerVerifier — ensures GhostStack Docker containers build successfully.
 */
import { execSync } from "child_process";

export class DockerVerifier {
  verify(projectDir: string): void {
    console.log("[GhostCode] Running docker compose build...");
    execSync("docker compose build", { cwd: projectDir, stdio: "inherit" });
    console.log("[GhostCode] Docker build successful.");
  }

  checkImages(): void {
    const output = execSync("docker images --format '{{.Repository}}:{{.Tag}}'").toString();
    const banned = ["ethereum", "geth", "parity", "nethermind", "besu"];
    for (const b of banned) {
      if (output.toLowerCase().includes(b)) {
        throw new Error(`[GhostCode] Banned Docker image detected: ${b}`);
      }
    }
  }
}
