import type { LayerKind, ManagedUnit, RuntimeEnvironment, UnitHealth } from "./types.js";

function deriveActualState(unit: ManagedUnit, health: UnitHealth): ManagedUnit["actualState"] {
  if (unit.desiredState === "maintenance") return "maintenance";
  if (unit.desiredState === "stopped") return "stopped";
  if (health.status === "fail") return "failed";
  if (health.status === "warn") return "degraded";
  return "running";
}

export class StateStore {
  private readonly units = new Map<string, ManagedUnit>();

  replace(units: ManagedUnit[]): void {
    this.units.clear();
    for (const unit of units) {
      this.units.set(unit.id, unit);
    }
  }

  set(unit: ManagedUnit): void {
    this.units.set(unit.id, unit);
  }

  get(id: string): ManagedUnit | undefined {
    return this.units.get(id);
  }

  list(): ManagedUnit[] {
    return Array.from(this.units.values());
  }

  byEnv(env: RuntimeEnvironment): ManagedUnit[] {
    return this.list().filter((unit) => unit.env === env);
  }

  byLayer(layer: LayerKind): ManagedUnit[] {
    return this.list().filter((unit) => unit.layer === layer);
  }

  updateHealth(id: string, health: UnitHealth): void {
    const unit = this.units.get(id);
    if (!unit) return;

    this.units.set(id, {
      ...unit,
      health,
      actualState: deriveActualState(unit, health),
    });
  }
}
