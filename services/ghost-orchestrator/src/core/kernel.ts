import { StateStore } from "./state-store.js";
import type { ManagedUnit, RuntimeEnvironment } from "./types.js";

export class GhostKernel {
  constructor(private readonly store = new StateStore()) {}

  replaceInventory(units: ManagedUnit[]): void {
    this.store.replace(units);
  }

  inventory(): ManagedUnit[] {
    return this.store.list();
  }

  inventoryByEnv(env: RuntimeEnvironment): ManagedUnit[] {
    return this.store.byEnv(env);
  }

  degradedUnits(env?: RuntimeEnvironment): ManagedUnit[] {
    const units = env ? this.store.byEnv(env) : this.store.list();
    return units.filter((unit) => unit.health.status !== "ok");
  }

  updateHealth(id: string, health: ManagedUnit["health"]): void {
    this.store.updateHealth(id, health);
  }
}
