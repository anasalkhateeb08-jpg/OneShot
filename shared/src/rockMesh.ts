/**
 * Exact rock collision from the rock's own triangles (D-038). A rock is a unit-sized mesh
 * (every axis spans -1..1) that is moved by the map's rock data: scaled by (radiusXZ, radiusY,
 * radiusXZ), turned around Y by rotY, and placed at the collider center. A bullet, laser, or
 * line of sight is moved into that unit frame and tested against the triangles, so a gap that
 * looks open IS open. The old ellipsoid stays only as a fast first check and as the fallback
 * when no rock model is loaded.
 */
import { toBoxLocal } from "./geometry";
import type { Vec3 } from "./messages";
import type { RockProp } from "./maps";

export interface RockMesh {
  /** Triangles as flat x, y, z triples: 9 numbers per triangle, in the unit frame. */
  triangles: Float32Array;
  /** Bounding box of the triangles in the unit frame. */
  min: Vec3;
  max: Vec3;
  /**
   * The rock's natural height / width ratio (half height over half width). Rocks keep their
   * natural proportions instead of being stretched into the map's collider box (D-043).
   */
  aspect: number;
}

/** Fraction of the map's own rock height that still shapes the rock (the rest is natural). */
const MAP_HEIGHT_WEIGHT = 0.25;

/** Half height of a placed rock: mostly its natural proportions, a little of the map's height. */
export function rockHalfHeight(rock: RockProp, aspect: number): number {
  const c = rock.collider;
  return c.radiusY * MAP_HEIGHT_WEIGHT + c.radiusXZ * aspect * (1 - MAP_HEIGHT_WEIGHT);
}

/** Builds a RockMesh from flat triangle coordinates (9 numbers per triangle). */
export function createRockMesh(triangles: ArrayLike<number>, aspect = 1): RockMesh {
  const data = Float32Array.from(triangles);
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i + 2 < data.length; i += 3) {
    const x = data[i] ?? 0;
    const y = data[i + 1] ?? 0;
    const z = data[i + 2] ?? 0;
    if (x < min.x) min.x = x;
    if (y < min.y) min.y = y;
    if (z < min.z) min.z = z;
    if (x > max.x) max.x = x;
    if (y > max.y) max.y = y;
    if (z > max.z) max.z = z;
  }
  return { triangles: data, min, max, aspect };
}

/** Moves a world point into a rock's unit frame. */
function toRockLocal(rock: RockProp, p: Vec3, aspect: number): Vec3 {
  const c = rock.collider;
  const l = toBoxLocal(rock.rotY, p.x - c.center.x, p.z - c.center.z);
  return {
    x: l.x / c.radiusXZ,
    y: (p.y - c.center.y) / rockHalfHeight(rock, aspect),
    z: l.z / c.radiusXZ,
  };
}

/** Segment against an axis-aligned box (t in 0..1 or null). */
function segmentBox(a: Vec3, b: Vec3, min: Vec3, max: Vec3): boolean {
  let t0 = 0;
  let t1 = 1;
  const axes = ["x", "y", "z"] as const;
  for (const k of axes) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) {
      if (a[k] < min[k] || a[k] > max[k]) return false;
      continue;
    }
    let s = (min[k] - a[k]) / d;
    let e = (max[k] - a[k]) / d;
    if (s > e) [s, e] = [e, s];
    if (s > t0) t0 = s;
    if (e < t1) t1 = e;
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * First hit of segment a->b (world coordinates) with a rock's mesh.
 * Scaling and turning are affine, so the fraction t along the segment is the same in the unit
 * frame and in the world.
 * @returns t in [0, 1], or null if the segment misses every triangle.
 */
export function segmentRockMesh(a: Vec3, b: Vec3, rock: RockProp, mesh: RockMesh): number | null {
  const la = toRockLocal(rock, a, mesh.aspect);
  const lb = toRockLocal(rock, b, mesh.aspect);
  if (!segmentBox(la, lb, mesh.min, mesh.max)) return null;
  const dx = lb.x - la.x;
  const dy = lb.y - la.y;
  const dz = lb.z - la.z;
  const tri = mesh.triangles;
  let best: number | null = null;
  for (let i = 0; i + 8 < tri.length; i += 9) {
    const ax = tri[i] ?? 0;
    const ay = tri[i + 1] ?? 0;
    const az = tri[i + 2] ?? 0;
    const e1x = (tri[i + 3] ?? 0) - ax;
    const e1y = (tri[i + 4] ?? 0) - ay;
    const e1z = (tri[i + 5] ?? 0) - az;
    const e2x = (tri[i + 6] ?? 0) - ax;
    const e2y = (tri[i + 7] ?? 0) - ay;
    const e2z = (tri[i + 8] ?? 0) - az;
    // Moller-Trumbore, both faces.
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = la.x - ax;
    const sy = la.y - ay;
    const sz = la.z - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t < 0 || t > 1) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}
