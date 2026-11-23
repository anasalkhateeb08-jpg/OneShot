import { describe, expect, it } from "vitest";
import { PLAYER, SCOPE } from "./constants";
import { DESERT_CANYON } from "./mapDesert";
import { isInZone } from "./maps";
import { toBoxLocal } from "./geometry";
import { PLAYER_RADIUS_M, stepMovement } from "./movement";
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

  it("creeps slowly while scoped, in every posture (D-035)", () => {
    for (const posture of ["stand", "crouch", "prone"] as const) {
      const p = stepMovement(start, { ...base, moveX: 1, posture, scoped: true }, 1, zone, grid);
      expect(p.x - start.x).toBeCloseTo(PLAYER.speed[posture] * SCOPE.creepSpeedFactor, 9);
    }
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

  it("cannot walk into a rock and slides around it (D-031)", () => {
    const rock = {
      center: { x: start.x, y: sampleHeight(grid, start.x, start.z - 3) + 0.5, z: start.z - 3 },
      radiusXZ: 1.5,
      radiusY: 1.2,
    };
    let p = start;
    for (let i = 0; i < 200; i++) {
      p = stepMovement(p, { ...base, moveZ: 1 }, 0.05, zone, grid, [rock]);
      const d = Math.hypot(p.x - rock.center.x, p.z - rock.center.z);
      expect(d).toBeGreaterThanOrEqual(rock.radiusXZ * 0.99 + PLAYER_RADIUS_M - 0.02);
    }
    // Pushing diagonally still makes sideways progress (slides, does not stick).
    let q = p;
    for (let i = 0; i < 40; i++) {
      q = stepMovement(q, { ...base, moveZ: 1, moveX: 1 }, 0.05, zone, grid, [rock]);
    }
    expect(Math.abs(q.x - p.x)).toBeGreaterThan(0.5);
  });

  it("walks freely over a rock that is above the player's head", () => {
    const high = {
      center: { x: start.x, y: start.y + 20, z: start.z - 1 },
      radiusXZ: 1,
      radiusY: 1,
    };
    const p = stepMovement(start, { ...base, moveZ: 1 }, 0.5, zone, grid, [high]);
    expect(p.z).toBeCloseTo(start.z - PLAYER.speed.stand * 0.5, 9);
  });

  it("cannot walk through a crate and slides along its face (D-032)", () => {
    const crate = {
      box: {
        center: { x: start.x, y: sampleHeight(grid, start.x, start.z - 3) + 0.5, z: start.z - 3 },
        half: { x: 1, y: 0.5, z: 0.5 },
        rotY: 0.4,
      },
      lean: 0,
      variant: 0,
    };
    let p = start;
    for (let i = 0; i < 200; i++) {
      p = stepMovement(p, { ...base, moveZ: 1 }, 0.05, zone, grid, [], [crate]);
      const local = toBoxLocal(crate.box.rotY, p.x - crate.box.center.x, p.z - crate.box.center.z);
      const inside =
        Math.abs(local.x) < crate.box.half.x + PLAYER_RADIUS_M - 1e-6 &&
        Math.abs(local.z) < crate.box.half.z + PLAYER_RADIUS_M - 1e-6;
      expect(inside).toBe(false);
    }
  });
});
