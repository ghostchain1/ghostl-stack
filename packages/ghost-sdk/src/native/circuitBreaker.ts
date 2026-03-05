export type CircuitBreakerOptions = {
  failureThreshold: number;
  coolDownMs: number;
};

export class GhostCircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(private readonly opts: CircuitBreakerOptions) {}

  canRun(now = Date.now()): boolean { return now >= this.openUntil; }

  onSuccess(): void { this.failures = 0; this.openUntil = 0; }

  onFailure(now = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.opts.failureThreshold) {
      this.openUntil = now + this.opts.coolDownMs;
      this.failures = 0;
    }
  }
}
