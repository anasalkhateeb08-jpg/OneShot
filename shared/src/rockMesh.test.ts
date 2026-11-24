import { describe, expect, it } from "vitest";
import { segmentEllipsoid } from "./geometry";
import { raycastWorld, traceSegment } from "./raycast";
import type { WorldColliders } from "./raycast";
import { createRockMesh, rockHalfHeight, segmentRockMesh } from "./rockMesh";
import { buildHeightGrid } from "./terrain";
import type { RockProp } from "./maps";

/** A thin vertical plate at x = 1 (the far right edge of the unit frame), 2 wide and 2 tall. */
const plate = createRockMesh([
  1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, 1,
  // Two more triangles at x = -1 so the bounding box spans the whole unit frame.
  -1, -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, -1, -1, 1, 1, -1, -1, 1,
]);

const rock: RockProp = {
  collider: { center: { x: 0, y: 5, z: 0 }, radiusXZ: 3, radiusY: 2 },
  variant: 0,
  rotY: 0,
};

describe("exact rock collision (D-038)", () => {
  it("lets a shot through the open middle of a rock whose ellipsoid would block it", () => {
    const a = { x: 0, y: 5, z: -10 };
    const b = { x: 0, y: 5, z: 10 };
    // The ellipsoid fills the middle, the real shape is two plates at x = +-3: open there.
    expect(segmentEllipsoid(a, b, rock.collider)).not.toBeNull();
    expect(segmentRockMesh(a, b, rock, plate)).toBeNull();
  });

  it("hits the plate where it really is, at the right distance", () => {
    const t = segmentRockMesh({ x: 10, y: 5, z: 0 }, { x: -10, y: 5, z: 0 }, rock, plate);
    expect(t).not.toBeNull();
    expect((t ?? 0) * 20).toBeCloseTo(7, 6);
  });

  it("follows the rock's turn and size", () => {
    const turned: RockProp = { ...rock, rotY: Math.PI / 2 };
    // Turned a quarter: the plates now stand across the Z axis, 3 m either side of the center.
    const t = segmentRockMesh({ x: 0, y: 5, z: 10 }, { x: 0, y: 5, z: -10 }, turned, plate);
    expect(t).not.toBeNull();
    expect((t ?? 0) * 20).toBeCloseTo(7, 6);
    // And a shot along the old line now passes between the plates.
    expect(
      segmentRockMesh({ x: 10, y: 5, z: 0 }, { x: -10, y: 5, z: 0 }, turned, plate),
    ).toBeNull();
  });

  it("misses above and beside the rock", () => {
    expect(segmentRockMesh({ x: 10, y: 9, z: 0 }, { x: -10, y: 9, z: 0 }, rock, plate)).toBeNull();
    expect(segmentRockMesh({ x: 10, y: 5, z: 4 }, { x: -10, y: 5, z: 4 }, rock, plate)).toBeNull();
  });

  it("is used by the world trace and the laser, with the ellipsoid as the fallback", () => {
    const grid = buildHeightGrid({ minX: -50, maxX: 50, minZ: -50, maxZ: 50, step: 5 }, () => 0);
    const exact: WorldColliders = { grid, walls: [], rocks: [rock], rockMeshes: [plate] };
    const fallback: WorldColliders = { grid, walls: [], rocks: [rock] };
    const a = { x: 0, y: 5, z: -10 };
    const b = { x: 0, y: 5, z: 10 };
    expect(traceSegment(exact, a, b)).toBeNull();
    expect(traceSegment(fallback, a, b)?.kind).toBe("rock");
    const dir = { x: 0, y: 0, z: 1 };
    expect(raycastWorld(exact, a, dir, 20)).toBeNull();
    expect(raycastWorld(fallback, a, dir, 20)?.kind).toBe("rock");
  });

  it("keeps a rock's natural height instead of stretching it (D-043)", () => {
    // A flat rock (half height = 40% of its half width) is placed where the map asks for tall.
    const tall: RockProp = {
      collider: { center: { x: 0, y: 0, z: 0 }, radiusXZ: 4, radiusY: 4 },
      variant: 0,
      rotY: 0,
    };
    const h = rockHalfHeight(tall, 0.4);
    expect(h).toBeLessThan(2.5);
    expect(h).toBeGreaterThan(1.6);
    // A shot just above that real height misses; the old stretched height would have hit.
    const flat = createRockMesh(plate.triangles, 0.4);
    expect(segmentRockMesh({ x: 10, y: 3, z: 0 }, { x: -10, y: 3, z: 0 }, tall, flat)).toBeNull();
    expect(
      segmentRockMesh({ x: 10, y: 1, z: 0 }, { x: -10, y: 1, z: 0 }, tall, flat),
    ).not.toBeNull();
  });
});
