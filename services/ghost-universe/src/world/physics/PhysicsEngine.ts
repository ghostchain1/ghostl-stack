/**
 * PhysicsEngine — Lightweight simulation physics for Ghost Universe worlds
 *
 * Handles collision detection, gravity, velocity integration, and
 * trigger zones for avatar movement and object interaction.
 * Runs server-side at ~20 Hz; results are broadcast via the network layer.
 */

export interface PhysicsBody {
  id:       string;
  type:     'avatar' | 'object' | 'trigger' | 'terrain';
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  mass:     number;      // kg
  radius:   number;      // bounding sphere radius (metres)
  static:   boolean;     // static bodies are not moved by physics
  onGround: boolean;
}

export interface CollisionEvent {
  a:         string;     // body id
  b:         string;     // body id
  normal:    { x: number; y: number; z: number };
  impulse:   number;
  timestamp: number;
}

export interface PhysicsConfig {
  gravity:    number;    // m/s² (default 9.81)
  tickRateHz: number;    // simulation tick rate
  worldBounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
}

// ─── PhysicsEngine ────────────────────────────────────────────────────────────

export class PhysicsEngine {
  private bodies:    Map<string, PhysicsBody> = new Map();
  private cfg:       PhysicsConfig;
  private listeners: ((event: CollisionEvent) => void)[] = [];
  private timer?:    ReturnType<typeof setInterval>;

  constructor(config: PhysicsConfig) {
    this.cfg = config;
  }

  /** Add or replace a physics body. */
  addBody(body: PhysicsBody): void {
    this.bodies.set(body.id, { ...body });
  }

  /** Remove a body (e.g. avatar left the world). */
  removeBody(id: string): void {
    this.bodies.delete(id);
  }

  /** Get body by ID. */
  getBody(id: string): PhysicsBody | undefined {
    return this.bodies.get(id);
  }

  /** Apply an impulse to a body (e.g. a jump or explosion). */
  applyImpulse(id: string, impulse: { x: number; y: number; z: number }): void {
    const body = this.bodies.get(id);
    if (!body || body.static) return;
    body.velocity.x += impulse.x / body.mass;
    body.velocity.y += impulse.y / body.mass;
    body.velocity.z += impulse.z / body.mass;
  }

  /**
   * Start the physics simulation loop.
   */
  start(): void {
    if (this.timer) return;
    const dt = 1000 / this.cfg.tickRateHz;
    this.timer = setInterval(() => this.tick(dt / 1000), dt);
  }

  /** Stop the physics loop. */
  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  /** Register a collision listener. */
  onCollision(fn: (event: CollisionEvent) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private tick(dt: number): void {
    const bodies = Array.from(this.bodies.values());

    for (const b of bodies) {
      if (b.static) continue;

      // Apply gravity
      b.velocity.y -= this.cfg.gravity * dt;

      // Integrate position
      b.position.x += b.velocity.x * dt;
      b.position.y += b.velocity.y * dt;
      b.position.z += b.velocity.z * dt;

      // Ground clamp (sea level = 0)
      if (b.position.y <= 0) {
        b.position.y = 0;
        b.velocity.y = 0;
        b.onGround   = true;
      } else {
        b.onGround = false;
      }

      // World bounds clamp
      b.position.x = Math.max(this.cfg.worldBounds.minX, Math.min(this.cfg.worldBounds.maxX, b.position.x));
      b.position.z = Math.max(this.cfg.worldBounds.minZ, Math.min(this.cfg.worldBounds.maxZ, b.position.z));
    }

    // Broad-phase collision (N² — suitable for <200 bodies per zone)
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        if (a.type === 'terrain' || b.type === 'terrain') continue;
        const dist = this.dist(a.position, b.position);
        if (dist < a.radius + b.radius) {
          const normal = this.normalize({
            x: b.position.x - a.position.x,
            y: b.position.y - a.position.y,
            z: b.position.z - a.position.z,
          });
          const impulse = Math.abs(
            (a.velocity.x - b.velocity.x) * normal.x +
            (a.velocity.y - b.velocity.y) * normal.y +
            (a.velocity.z - b.velocity.z) * normal.z,
          );
          const event: CollisionEvent = { a: a.id, b: b.id, normal, impulse, timestamp: Date.now() };
          for (const fn of this.listeners) fn(event);
        }
      }
    }
  }

  private dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }

  private normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }
}
