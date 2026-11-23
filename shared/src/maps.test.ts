import { describe, expect, it } from "vitest";
import { horizontalDistance, segmentAabb, segmentEllipsoid } from "./geometry";
import type { Vec3 } from "./messages";
import { DESERT_CANYON, DESERT_ZONE_HEIGHT } from "./mapDesert";
import { clampToZone, isInZone, mirrorBox } from "./maps";
import { PLAYER } from "./constants";
import { buildHeightGrid, segmentTerrain } from "./terrain";

const map = DESERT_CANYON;
const grid = buildHeightGrid(map.grid, map.heightAt);

function lineOfSightBlocked(a: Vec3, b: Vec3): boolean {
  if (map.walls.some((w) => segmentAabb(a, b, w.box) !== null)) return true;
  if (map.rocks.some((r) => segmentEllipsoid(a, b, r.collider) !== null)) return true;
  return segmentTerrain(grid, a, b, 1) !== null;
}

describe("desert canyon map", () => {
  const [zoneA, zoneB] = map.zones;

  it("is mirrored: terrain height is identical at (x, z) and (-x, -z)", () => {
    for (let i = 0; i < 300; i++) {
      const x = ((i * 37.3) % 760) - 380;
      const z = ((i * 53.9) % 600) - 300;
      expect(map.heightAt(x, z)).toBe(map.heightAt(-x, -z));
    }
  });

  it("has mirrored zones, walls, rocks, and shrubs", () => {
    expect(zoneB.centerX + zoneA.centerX).toBe(0);
    expect(zoneB.centerZ).toBe(-zoneA.centerZ);
    expect(zoneB.spawnZ).toBe(-zoneA.spawnZ);
    expect(map.walls.length % 2).toBe(0);
    const half = map.walls.length / 2;
    for (let i = 0; i < half; i++) {
      const w = map.walls[i];
      const m = map.walls[i + half];
      if (!w || !m) throw new Error("missing wall");
      expect(m.box).toEqual(mirrorBox(w.box));
    }
    expect(map.rocks.length % 2).toBe(0);
    expect(map.shrubs.length % 2).toBe(0);
  });

  it("uses only natural cover in the desert (no walls)", () => {
    expect(map.walls).toHaveLength(0);
    expect(map.rocks.length).toBeGreaterThan(100);
  });

  it("has mirrored crates that do not overlap rocks (D-032, D-033)", () => {
    expect(map.crates.length).toBeGreaterThan(40);
    expect(map.crates.length % 2).toBe(0);
    const half = map.crates.length / 2;
    for (let i = 0; i < half; i++) {
      const c = map.crates[i];
      const m = map.crates[i + half];
      if (!c || !m) throw new Error("missing crate");
      expect(m.box.center.x + c.box.center.x).toBeCloseTo(0, 9);
      expect(m.box.center.z + c.box.center.z).toBeCloseTo(0, 9);
      expect(m.box.center.y).toBe(c.box.center.y);
    }
    // No crate sits inside a rock's footprint (stacked crates share the lower crate's spot).
    for (const c of map.crates) {
      for (const r of map.rocks) {
        const d = Math.hypot(
          r.collider.center.x - c.box.center.x,
          r.collider.center.z - c.box.center.z,
        );
        expect(d).toBeGreaterThan(r.collider.radiusXZ);
      }
    }
  });

  it("keeps the spawn lane free of crates", () => {
    for (const c of map.crates) {
      const dx = Math.abs(c.box.center.x - zoneA.spawnX);
      const dz = Math.abs(c.box.center.z - zoneA.spawnZ);
      expect(dx < 4 && dz < 4).toBe(false);
    }
  });

  it("puts the two spawns at least 350 m apart (master section 9)", () => {
    const a = { x: zoneA.spawnX, y: 0, z: zoneA.spawnZ };
    const b = { x: zoneB.spawnX, y: 0, z: zoneB.spawnZ };
    expect(horizontalDistance(a, b)).toBeGreaterThanOrEqual(350);
  });

  it("hides the spawns from each other at the start (standing eye height)", () => {
    const eye = PLAYER.eyeHeight.stand;
    const a = { x: zoneA.spawnX, y: DESERT_ZONE_HEIGHT + eye, z: zoneA.spawnZ };
    const b = { x: zoneB.spawnX, y: DESERT_ZONE_HEIGHT + eye, z: zoneB.spawnZ };
    expect(lineOfSightBlocked(a, b)).toBe(true);
  });

  it("is not a stalemate map: some zone positions can see the other zone", () => {
    const eye = PLAYER.eyeHeight.stand;
    let visible = 0;
    for (let ax = -28; ax <= 28; ax += 4) {
      for (let bx = -28; bx <= 28; bx += 4) {
        const a = { x: ax, y: map.heightAt(ax, zoneA.centerZ) + eye, z: zoneA.centerZ };
        const b = { x: bx, y: map.heightAt(bx, zoneB.centerZ) + eye, z: zoneB.centerZ };
        if (!lineOfSightBlocked(a, b)) visible++;
      }
    }
    expect(visible).toBeGreaterThan(10);
  });

  it("keeps spawns inside their zones and every prop inside the terrain grid", () => {
    expect(isInZone(zoneA, zoneA.spawnX, zoneA.spawnZ)).toBe(true);
    expect(isInZone(zoneB, zoneB.spawnX, zoneB.spawnZ)).toBe(true);
    const inGrid = (x: number, z: number): boolean =>
      x >= map.grid.minX && x <= map.grid.maxX && z >= map.grid.minZ && z <= map.grid.maxZ;
    for (const r of map.rocks) expect(inGrid(r.collider.center.x, r.collider.center.z)).toBe(true);
    for (const s of map.shrubs) expect(inGrid(s.pos.x, s.pos.z)).toBe(true);
  });

  it("clamps positions into a zone", () => {
    const p = clampToZone(zoneA, 500, -500);
    expect(isInZone(zoneA, p.x, p.z)).toBe(true);
  });
});
