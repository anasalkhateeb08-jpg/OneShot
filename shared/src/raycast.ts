/**
 * Line-of-sight ray against the world (terrain, walls, rocks).
 * Used by the rangefinder now, and later by the server for exposure checks and the AI's sight.
 * Shrubs are decoration and do not stop a ray.
 */
import { addScaled, normalize, segmentAabb, segmentEllipsoid } from "./geometry";
import type { RockProp, WallProp } from "./maps";
import type { Vec3 } from "./messages";
import { segmentTerrain } from "./terrain";
import type { HeightGrid } from "./terrain";

export interface WorldColliders {
  grid: HeightGrid;
  walls: readonly WallProp[];
  rocks: readonly RockProp[];
}

export type RayHitKind = "terrain" | "wall" | "rock";

export interface RayHit {
  distance: number;
  point: Vec3;
  kind: RayHitKind;
}

/**
 * Nearest hit along a ray, or null if nothing is hit within maxDistance.
 * @param terrainStepM terrain sampling interval (smaller = more precise, slower)
 */
export function raycastWorld(
  world: WorldColliders,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  terrainStepM = 1,
): RayHit | null {
  const dir = normalize(direction);
  const end = addScaled(origin, dir, maxDistance);
  let bestT = Number.POSITIVE_INFINITY;
  let kind: RayHitKind = "terrain";

  for (const w of world.walls) {
    const t = segmentAabb(origin, end, w.box);
    if (t !== null && t < bestT) {
      bestT = t;
      kind = "wall";
    }
  }
  for (const r of world.rocks) {
    const t = segmentEllipsoid(origin, end, r.collider);
    if (t !== null && t < bestT) {
      bestT = t;
      kind = "rock";
    }
  }
  // Only search the terrain up to the nearest prop hit.
  const terrainEnd = Number.isFinite(bestT) ? addScaled(origin, dir, maxDistance * bestT) : end;
  const tt = segmentTerrain(world.grid, origin, terrainEnd, terrainStepM);
  if (tt !== null) {
    const scaleToFull = Number.isFinite(bestT) ? bestT : 1;
    bestT = tt * scaleToFull;
    kind = "terrain";
  }

  if (!Number.isFinite(bestT)) return null;
  const distance = maxDistance * bestT;
  return { distance, point: addScaled(origin, dir, distance), kind };
}
