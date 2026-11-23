/**
 * Terrain height grid (master section 9: collision computed directly from the heightmap).
 * The client builds its terrain MESH from this exact grid with the same triangulation, and
 * sampleHeight() interpolates the same triangles, so what you see is what bullets hit.
 *
 * Triangulation of each cell (x0..x1, z0..z1):
 *   triangle 1: (x0,z0) (x0,z1) (x1,z0)
 *   triangle 2: (x1,z0) (x0,z1) (x1,z1)
 */
import type { Vec3 } from "./messages";

export interface HeightGrid {
  originX: number;
  originZ: number;
  step: number;
  /** Number of vertices along X. */
  cols: number;
  /** Number of vertices along Z. */
  rows: number;
  /** Heights, row-major: index = row * cols + col (row along Z, col along X). */
  heights: Float32Array;
}

export interface GridSpec {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  step: number;
}

export function buildHeightGrid(
  spec: GridSpec,
  heightAt: (x: number, z: number) => number,
): HeightGrid {
  const cols = Math.round((spec.maxX - spec.minX) / spec.step) + 1;
  const rows = Math.round((spec.maxZ - spec.minZ) / spec.step) + 1;
  const heights = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const z = spec.minZ + r * spec.step;
    for (let c = 0; c < cols; c++) {
      heights[r * cols + c] = heightAt(spec.minX + c * spec.step, z);
    }
  }
  return { originX: spec.minX, originZ: spec.minZ, step: spec.step, cols, rows, heights };
}

function at(g: HeightGrid, c: number, r: number): number {
  const cc = c < 0 ? 0 : c >= g.cols ? g.cols - 1 : c;
  const rr = r < 0 ? 0 : r >= g.rows ? g.rows - 1 : r;
  return g.heights[rr * g.cols + cc] ?? 0;
}

/** Terrain height at (x, z), exactly on the rendered triangles. Clamped at the grid edge. */
export function sampleHeight(g: HeightGrid, x: number, z: number): number {
  const maxX = g.originX + (g.cols - 1) * g.step;
  const maxZ = g.originZ + (g.rows - 1) * g.step;
  const cx = Math.min(Math.max(x, g.originX), maxX);
  const cz = Math.min(Math.max(z, g.originZ), maxZ);
  const gx = (cx - g.originX) / g.step;
  const gz = (cz - g.originZ) / g.step;
  let c = Math.floor(gx);
  let r = Math.floor(gz);
  if (c >= g.cols - 1) c = g.cols - 2;
  if (r >= g.rows - 1) r = g.rows - 2;
  const fx = gx - c;
  const fz = gz - r;
  const h00 = at(g, c, r);
  const h10 = at(g, c + 1, r);
  const h01 = at(g, c, r + 1);
  const h11 = at(g, c + 1, r + 1);
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

/**
 * First point where segment a->b goes below the terrain.
 * Samples about every `stepM` meters, then refines by bisection.
 * @returns t in [0, 1] along the segment, or null if the segment stays above ground
 */
export function segmentTerrain(g: HeightGrid, a: Vec3, b: Vec3, stepM = 1): number | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / stepM));
  const below = (t: number): boolean => {
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    return y < sampleHeight(g, x, z);
  };
  if (below(0)) return 0;
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (below(t)) {
      let lo = prev;
      let hi = t;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    prev = t;
  }
  return null;
}
