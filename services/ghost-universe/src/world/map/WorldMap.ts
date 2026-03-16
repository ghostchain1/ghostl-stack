/**
 * WorldMap — Spatial index and tile management for Ghost Universe worlds
 *
 * Maintains a tile grid that maps grid coordinates to parcels, regions,
 * and points of interest.  Supports efficient range queries for rendering
 * and player presence detection.
 */

import type { Region } from '../generator/WorldGenerator.js';

export type TileType = 'land' | 'water' | 'road' | 'building' | 'park' | 'void';

export interface Tile {
  x:        number;
  y:        number;
  type:     TileType;
  parcelId: bigint | null;
  regionId: string | null;
  elevation: number;
  walkable:  boolean;
}

export interface PointOfInterest {
  poiId:    string;
  name:     string;
  type:     'warp' | 'shop' | 'event-venue' | 'transport' | 'info';
  position: { x: number; y: number; z: number };
  worldId:  string;
}

export interface MapBounds {
  x1: number; y1: number; x2: number; y2: number;
}

// ─── WorldMap ──────────────────────────────────────────────────────────────────

export class WorldMap {
  private worldId:  string;
  private tiles:    Map<string, Tile>            = new Map();
  private pois:     Map<string, PointOfInterest> = new Map();
  private regionIndex: Map<string, Region>       = new Map();

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  /**
   * Bootstrap map from generator regions — creates road grid between them.
   */
  initFromRegions(regions: Region[]): void {
    for (const r of regions) {
      this.regionIndex.set(r.regionId, r);
      this.fillRegion(r);
    }
  }

  /**
   * Set a tile at (x, y).
   */
  setTile(tile: Tile): void {
    this.tiles.set(this.key(tile.x, tile.y), tile);
  }

  /**
   * Get a tile at (x, y).  Returns a void tile if out-of-bounds or unmapped.
   */
  getTile(x: number, y: number): Tile {
    return this.tiles.get(this.key(x, y)) ?? { x, y, type: 'void', parcelId: null, regionId: null, elevation: 0, walkable: false };
  }

  /**
   * Get all tiles inside a bounding box.
   */
  getTilesInBounds(bounds: MapBounds): Tile[] {
    const result: Tile[] = [];
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      for (let y = bounds.y1; y <= bounds.y2; y++) {
        result.push(this.getTile(x, y));
      }
    }
    return result;
  }

  /**
   * Find the region a position belongs to.
   */
  getRegionAt(x: number, y: number): Region | null {
    for (const r of this.regionIndex.values()) {
      if (x >= r.bounds.x1 && x <= r.bounds.x2 && y >= r.bounds.y1 && y <= r.bounds.y2) {
        return r;
      }
    }
    return null;
  }

  /**
   * Register a point of interest.
   */
  addPOI(poi: PointOfInterest): void {
    this.pois.set(poi.poiId, poi);
  }

  /**
   * Get all POIs within radius (Euclidean, ignoring Z) of a point.
   */
  getPOIsNear(x: number, y: number, radius: number): PointOfInterest[] {
    return Array.from(this.pois.values()).filter(p => {
      const dx = p.position.x - x;
      const dy = p.position.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  }

  /** Serialise the map to a compact JSON-friendly object for API responses. */
  toGeoJSON(): { worldId: string; tileCount: number; regions: Region[]; pois: PointOfInterest[] } {
    return {
      worldId:   this.worldId,
      tileCount: this.tiles.size,
      regions:   Array.from(this.regionIndex.values()),
      pois:      Array.from(this.pois.values()),
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  private fillRegion(r: Region): void {
    for (let x = r.bounds.x1; x <= r.bounds.x2; x++) {
      for (let y = r.bounds.y1; y <= r.bounds.y2; y++) {
        // Road grid every 10 tiles
        const isRoad = (x - r.bounds.x1) % 10 === 0 || (y - r.bounds.y1) % 10 === 0;
        this.setTile({
          x, y,
          type:      isRoad ? 'road' : 'land',
          parcelId:  null,
          regionId:  r.regionId,
          elevation: r.elevation,
          walkable:  true,
        });
      }
    }
  }
}
