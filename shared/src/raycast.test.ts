import { describe, expect, it } from "vitest";
import { PLAYER } from "./constants";
import { directionFromYawPitch } from "./geometry";
import { DESERT_CANYON } from "./mapDesert";
import { raycastWorld } from "./raycast";
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

describe("raycastWorld", () => {
  it("hits the spawn cover boulder straight ahead at the start", () => {
    const hit = raycastWorld(world, eye, directionFromYawPitch(zone.facingYaw, 0), 1500);
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
