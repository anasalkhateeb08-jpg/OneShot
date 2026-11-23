import { describe, expect, it } from "vitest";
import { buildHeightGrid, sampleHeight, segmentTerrain } from "./terrain";

const spec = { minX: -10, maxX: 10, minZ: -6, maxZ: 6, step: 2 };
const bumpy = (x: number, z: number): number => Math.sin(x * 0.7) * 2 + Math.cos(z * 0.5);

describe("height grid", () => {
  const g = buildHeightGrid(spec, bumpy);

  it("has the right size", () => {
    expect(g.cols).toBe(11);
    expect(g.rows).toBe(7);
    expect(g.heights).toHaveLength(77);
  });

  it("returns the exact grid height at every vertex", () => {
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const x = spec.minX + c * spec.step;
        const z = spec.minZ + r * spec.step;
        expect(sampleHeight(g, x, z)).toBeCloseTo(g.heights[r * g.cols + c] ?? Number.NaN, 5);
      }
    }
  });

  it("interpolates on the cell's triangles (planar on each triangle)", () => {
    const flatSlope = buildHeightGrid(spec, (x, z) => 0.5 * x - 0.25 * z + 3);
    expect(sampleHeight(flatSlope, 1.3, -2.7)).toBeCloseTo(0.5 * 1.3 + 0.25 * 2.7 + 3, 5);
    expect(sampleHeight(flatSlope, -7.9, 4.4)).toBeCloseTo(-0.5 * 7.9 - 0.25 * 4.4 + 3, 5);
  });

  it("clamps outside the grid", () => {
    expect(sampleHeight(g, -100, -100)).toBeCloseTo(g.heights[0] ?? Number.NaN, 5);
  });

  it("finds where a segment enters the ground, and misses when above it", () => {
    const flat = buildHeightGrid(spec, () => 0);
    const t = segmentTerrain(flat, { x: -8, y: 4, z: 0 }, { x: 8, y: -4, z: 0 });
    expect(t).toBeCloseTo(0.5, 4);
    expect(segmentTerrain(flat, { x: -8, y: 1, z: 0 }, { x: 8, y: 1, z: 0 })).toBeNull();
  });
});
