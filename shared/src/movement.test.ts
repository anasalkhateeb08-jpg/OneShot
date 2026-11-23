import { describe, expect, it } from "vitest";
import { PLAYER } from "./constants";
import { DESERT_CANYON } from "./mapDesert";
import { isInZone } from "./maps";
import { stepMovement } from "./movement";
import type { MoveInput } from "./movement";
import { buildHeightGrid, sampleHeight } from "./terrain";

const grid = buildHeightGrid(DESERT_CANYON.grid, DESERT_CANYON.heightAt);
const zone = DESERT_CANYON.zones[0];
const start = { x: zone.spawnX, y: 0, z: zone.spawnZ };

const base: MoveInput = { moveX: 0, moveZ: 0, yaw: 0, posture: "stand", scoped: false };

describe("stepMovement", () => {
  it("moves forward (-Z at yaw 0) at the standing speed", () => {
    const p = stepMovement(start, { ...base, moveZ: 1 }, 1, zone, grid);
    expect(p.z).toBeCloseTo(start.z - PLAYER.speed.stand, 9);
    expect(p.x).toBeCloseTo(start.x, 9);
  });

  it("moves right (+X at yaw 0) and follows the terrain height", () => {
    const p = stepMovement(start, { ...base, moveX: 1 }, 1, zone, grid);
    expect(p.x).toBeCloseTo(start.x + PLAYER.speed.stand, 9);
    expect(p.y).toBe(sampleHeight(grid, p.x, p.z));
  });

  it("is slower crouched and slowest prone", () => {
    const c = stepMovement(start, { ...base, moveX: 1, posture: "crouch" }, 1, zone, grid);
    const p = stepMovement(start, { ...base, moveX: 1, posture: "prone" }, 1, zone, grid);
    expect(c.x - start.x).toBeCloseTo(PLAYER.speed.crouch, 9);
    expect(p.x - start.x).toBeCloseTo(PLAYER.speed.prone, 9);
  });

  it("does not move while scoped", () => {
    const p = stepMovement(start, { ...base, moveZ: 1, moveX: 1, scoped: true }, 1, zone, grid);
    expect(p.x).toBe(start.x);
    expect(p.z).toBe(start.z);
  });

  it("does not move faster diagonally", () => {
    const p = stepMovement(start, { ...base, moveZ: 1, moveX: 1 }, 1, zone, grid);
    expect(Math.hypot(p.x - start.x, p.z - start.z)).toBeCloseTo(PLAYER.speed.stand, 9);
  });

  it("never leaves the player's zone, whatever the input", () => {
    let p = start;
    for (let i = 0; i < 600; i++) {
      p = stepMovement(p, { ...base, moveX: 1, moveZ: 1, yaw: i * 0.05 }, 0.1, zone, grid);
      expect(isInZone(zone, p.x, p.z)).toBe(true);
    }
  });
});
