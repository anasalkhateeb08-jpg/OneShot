import { describe, expect, it } from "vitest";
import { PLAYER } from "./constants";
import { directionFromYawPitch } from "./geometry";
import { DESERT_CANYON } from "./mapDesert";
import type { RockProp } from "./maps";
import { raycastWorld, traceSegment } from "./raycast";
import { buildHeightGrid, sampleHeight } from "./terrain";

const map = DESERT_CANYON;
const grid = buildHeightGrid(map.grid, map.heightAt);
const world = { grid, walls: map.walls, rocks: map.rocks };
const zone = map.zones[0];
const eye = {
  x: zone.spawnX,
  y: sampleHeight(grid, zone.spawnX, zone.spawnZ) + PLAYER.eyeHeight.stand,
  z: zone.spawnZ,
};
const ahead = directionFromYawPitch(zone.facingYaw, 0);
/**
 * A test boulder 9 m straight ahead of the spawn, radius 1.2 m. The map is hand-edited in the
 * editor (D-049), so the tests place their own rock instead of relying on where the map's
 * spawn cover happens to be today.
 */
const testRock: RockProp = {
  collider: {
    center: { x: eye.x + ahead.x * 9, y: eye.y, z: eye.z + ahead.z * 9 },
    radiusXZ: 1.2,
    radiusY: 1.2,
  },
  variant: 0,
  rotY: 0,
};
const withCover = { grid, walls: [], rocks: [testRock] };

describe("raycastWorld", () => {
  it("hits a boulder straight ahead of the spawn at the right distance", () => {
    const hit = raycastWorld(withCover, eye, ahead, 1500);
    expect(hit?.kind).toBe("rock");
    expect(hit?.distance).toBeGreaterThan(7);
    expect(hit?.distance).toBeLessThan(11);
  });

  it("hits the ground when looking down, at the expected distance", () => {
    const pitch = -Math.PI / 4;
    const hit = raycastWorld(world, eye, directionFromYawPitch(Math.PI / 2, pitch), 1500, 0.05);
    expect(hit?.kind).toBe("terrain");
    // Flat plateau: distance = eye height / sin(45 deg), within the sampling tolerance.
    expect(hit?.distance).toBeCloseTo(PLAYER.eyeHeight.stand / Math.sin(Math.PI / 4), 1);
  });

  it("returns null when looking at the open sky", () => {
    expect(raycastWorld(world, eye, directionFromYawPitch(0, 1.2), 1500)).toBeNull();
  });

  it("reports a hit point on the ray", () => {
    const dir = directionFromYawPitch(zone.facingYaw, -0.05);
    const hit = raycastWorld(world, eye, dir, 1500);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit.point.x).toBeCloseTo(eye.x + dir.x * hit.distance, 6);
      expect(hit.point.z).toBeCloseTo(eye.z + dir.z * hit.distance, 6);
    }
  });
});

describe("traceSegment", () => {
  it("stops a bullet segment at a boulder in its path", () => {
    const end = { x: eye.x + ahead.x * 20, y: eye.y, z: eye.z + ahead.z * 20 };
    const hit = traceSegment(withCover, eye, end);
    expect(hit?.kind).toBe("rock");
  });

  it("lets a high segment pass over everything", () => {
    const a = { x: 0, y: 200, z: 0 };
    expect(traceSegment(world, a, { x: 0, y: 200, z: -50 })).toBeNull();
  });
});
