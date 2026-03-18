import type { ManagedUnit, RuntimeEnvironment } from "../core/types.js";

const BOOT_LAYER_ORDER = ["hypervisor", "l1", "l2", "l3", "ops", "ai"] as const;

export interface BootPlanStep {
  layer: ManagedUnit["layer"];
  unitIds: string[];
  units: string[];
  blocking: boolean;
}

export function buildBootPlan(units: ManagedUnit[], env: RuntimeEnvironment): BootPlanStep[] {
  const scoped = units.filter((unit) => unit.env === env);

  return BOOT_LAYER_ORDER.map((layer) => {
    const layerUnits = scoped.filter((unit) => unit.layer === layer);

    return {
      layer,
      unitIds: layerUnits.map((unit) => unit.id),
      units: layerUnits.map((unit) => unit.name),
      blocking: layer === "hypervisor" || layer === "l1" || layer === "l2" || layer === "l3",
    };
  }).filter((step) => step.units.length > 0);
}
