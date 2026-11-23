/**
 * Line-of-sight ray against the world (terrain, walls, rocks).
 * Used by the rangefinder now, and later by the server for exposure checks and the AI's sight.
 * Shrubs are decoration and do not stop a ray.
 */
import {
  addScaled,
  normalize,
  segmentAabb,
  segmentEllipsoid,
  segmentOrientedBox,
} from "./geometry";
import type { CrateProp, RockProp, WallProp } from "./maps";
import { segmentRockMesh } from "./rockMesh";
import type { RockMesh } from "./rockMesh";
import type { Vec3 } from "./messages";
import { segmentTerrain } from "./terrain";
import type { HeightGrid } from "./terrain";

export interface WorldColliders {
  grid: HeightGrid;
  walls: readonly WallProp[];
  rocks: readonly RockProp[];
  /**
   * Exact rock shapes, one per visual variant (a rock uses `variant % length`). When present,
   * rocks are hit where their real surface is (D-038); otherwise the collider ellipsoid is used.
   */
  rockMeshes?: readonly RockMesh[];
  /** Crates: seen by the rangefinder, but bullets pass through them (see traceCrates). */
  crates?: readonly CrateProp[];
}

export type RayHitKind = "terrain" | "wall" | "rock" | "crate";

export interface RayHit {
  distance: number;
  point: Vec3;
  kind: RayHitKind;
}

export interface SegmentHit {
  /** Fraction along the segment, 0..1. */
  t: number;
  /** Solid things only; crates never stop a bullet. */
  kind: Exclude<RayHitKind, "crate">;
}

/** Hit of segment a->b with one rock: the real mesh when known, else its ellipsoid. */
function segmentRock(world: WorldColliders, a: Vec3, b: Vec3, rock: RockProp): number | null {
  const meshes = world.rockMeshes;
  if (meshes && meshes.length > 0) {
    const mesh = meshes[rock.variant % meshes.length];
    if (mesh) return segmentRockMesh(a, b, rock, mesh);
  }
  return segmentEllipsoid(a, b, rock.collider);
}

/**
 * First SOLID thing hit by segment a->b (terrain, walls, rocks), or null. Crates are not
 * included: bullets pass through them (use traceCrates).
 * Used for every bullet substep: the whole SEGMENT is tested, never just its end point.
 */
export function traceSegment(
  world: WorldColliders,
  a: Vec3,
  b: Vec3,
  terrainStepM = 1,
): SegmentHit | null {
  let best: SegmentHit | null = null;
  for (const w of world.walls) {
    const t = segmentAabb(a, b, w.box);
    if (t !== null && (best === null || t < best.t)) best = { t, kind: "wall" };
  }
  for (const r of world.rocks) {
    const t = segmentRock(world, a, b, r);
    if (t !== null && (best === null || t < best.t)) best = { t, kind: "rock" };
  }
  const tt = segmentTerrain(world.grid, a, b, terrainStepM);
  if (tt !== null && (best === null || tt < best.t)) best = { t: tt, kind: "terrain" };
  return best;
}

/** Crates crossed by segment a->b: entry fraction t and crate index, nearest first. */
export function traceCrates(
  world: WorldColliders,
  a: Vec3,
  b: Vec3,
): Array<{ t: number; index: number }> {
  const out: Array<{ t: number; index: number }> = [];
  const crates = world.crates ?? [];
  for (let i = 0; i < crates.length; i++) {
    const c = crates[i];
    if (!c) continue;
    const t = segmentOrientedBox(a, b, c.box);
    if (t !== null) out.push({ t, index: i });
  }
  return out.sort((x, y) => x.t - y.t);
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
    const t = segmentRock(world, origin, end, r);
    if (t !== null && t < bestT) {
      bestT = t;
      kind = "rock";
    }
  }
  for (const c of world.crates ?? []) {
    const t = segmentOrientedBox(origin, end, c.box);
    if (t !== null && t < bestT) {
      bestT = t;
      kind = "crate";
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
