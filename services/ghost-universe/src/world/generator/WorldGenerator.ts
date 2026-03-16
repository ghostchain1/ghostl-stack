/**
 * WorldGenerator — Procedural world generation for Ghost Universe
 *
 * Generates terrain, regions, biomes, and spawn points for new worlds.
 * All world state is anchored to GhostChain L3 (chainId 903).
 */

export type Biome = 'urban' | 'forest' | 'desert' | 'oceanic' | 'arctic' | 'void';

export type RegionType =
  | 'ghost-city'
  | 'ghost-arena'
  | 'ghost-casino'
  | 'ghost-mall'
  | 'ghost-festival'
  | 'ghost-park'
  | 'ghost-port'
  | 'residential'
  | 'commercial'
  | 'wilderness';

export interface Region {
  regionId:    string;
  name:        string;
  type:        RegionType;
  biome:       Biome;
  bounds:      { x1: number; y1: number; x2: number; y2: number };
  capacity:    number;   // max simultaneous players
  parcelCount: number;
  elevation:   number;   // metres above sea level
}

export interface GeneratorConfig {
  seed:          number;
  width:         number;   // world width in grid units
  height:        number;
  regionCount:   number;
  seaLevel:      number;
}

const PRESET_REGIONS: Partial<Record<RegionType, Omit<Region, 'regionId' | 'bounds'>>> = {
  'ghost-city':     { name: 'Ghost City',     type: 'ghost-city',     biome: 'urban',   capacity: 5000, parcelCount: 400, elevation: 10 },
  'ghost-arena':    { name: 'Ghost Arena',    type: 'ghost-arena',    biome: 'urban',   capacity: 2000, parcelCount:  50, elevation: 15 },
  'ghost-casino':   { name: 'Ghost Casino',   type: 'ghost-casino',   biome: 'urban',   capacity: 1000, parcelCount:  80, elevation: 10 },
  'ghost-mall':     { name: 'Ghost Mall',     type: 'ghost-mall',     biome: 'urban',   capacity: 3000, parcelCount: 200, elevation:  8 },
  'ghost-festival': { name: 'Ghost Festival', type: 'ghost-festival', biome: 'forest',  capacity: 8000, parcelCount: 150, elevation: 20 },
};

export class WorldGenerator {
  private cfg: GeneratorConfig;

  constructor(config: GeneratorConfig) {
    this.cfg = config;
  }

  /**
   * Generate regions for a new world using a seeded layout algorithm.
   * Preset named districts are always included; remaining slots are random.
   */
  generateRegions(): Region[] {
    const regions: Region[] = [];
    const presets = Object.entries(PRESET_REGIONS);

    let idx = 0;
    const step = Math.floor(this.cfg.width / Math.max(presets.length, 1));

    for (const [type, preset] of presets as [RegionType, typeof PRESET_REGIONS[keyof typeof PRESET_REGIONS]][]) {
      const x1 = idx * step;
      const x2 = x1 + step - 1;
      regions.push({
        regionId: this.regionId(type, idx),
        ...preset!,
        type,
        bounds: { x1, y1: 0, x2, y2: Math.floor(this.cfg.height * 0.6) },
      });
      idx++;
    }

    // Fill remaining with generated regions
    while (regions.length < this.cfg.regionCount) {
      regions.push(this.randomRegion(regions.length));
    }

    return regions;
  }

  /**
   * Generate a heightmap (simplified flat array of elevation values).
   */
  generateHeightmap(): Float32Array {
    const size = this.cfg.width * this.cfg.height;
    const map  = new Float32Array(size);
    let   rng  = this.cfg.seed;

    for (let i = 0; i < size; i++) {
      rng = (rng * 1664525 + 1013904223) & 0xffffffff;
      map[i] = ((rng >>> 0) / 0xffffffff) * 100;
    }
    return map;
  }

  /**
   * Pick a random spawn point inside the given bounds.
   */
  randomSpawn(bounds: Region['bounds']): { x: number; y: number; z: number } {
    const rng = (n: number) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    return {
      x: Math.round(bounds.x1 + rng(this.cfg.seed ^ 0xabc) * (bounds.x2 - bounds.x1)),
      y: Math.round(bounds.y1 + rng(this.cfg.seed ^ 0xdef) * (bounds.y2 - bounds.y1)),
      z: this.cfg.seaLevel,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private randomRegion(idx: number): Region {
    const types: RegionType[] = ['residential', 'commercial', 'wilderness', 'ghost-park', 'ghost-port'];
    const biomes: Biome[]     = ['urban', 'forest', 'desert', 'oceanic'];
    const type  = types[idx % types.length]!;
    const biome = biomes[idx % biomes.length]!;
    const x1    = (idx + 5) * 50;

    return {
      regionId:    this.regionId(type, idx),
      name:        `${type.replace('-', ' ')} District ${idx}`,
      type,
      biome,
      bounds:      { x1, y1: 0, x2: x1 + 49, y2: 99 },
      capacity:    500,
      parcelCount: 25,
      elevation:   10,
    };
  }

  private regionId(type: string, idx: number): string {
    return `region-${type}-${idx}-${this.cfg.seed.toString(16)}`;
  }
}
