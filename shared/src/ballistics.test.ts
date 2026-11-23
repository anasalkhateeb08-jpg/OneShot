import { describe, expect, it } from "vitest";
import {
  BULLET_DT,
  heightAtDistance,
  launchState,
  muzzleVelocity,
  solveZeroPitch,
  stepBullet,
  zeroPitches,
} from "./ballistics";
import type { BulletState } from "./ballistics";
import { BALLISTICS, RIFLE } from "./constants";
import { length } from "./geometry";
import type { Vec3 } from "./messages";

const STILL: Vec3 = { x: 0, y: 0, z: 0 };

/** Fires horizontally toward -Z from the origin and flies until the given distance. */
function flyTo(distanceM: number, wind: Vec3 = STILL, dragK: number = BALLISTICS.dragK) {
  let s: BulletState = {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: -BALLISTICS.muzzleSpeed },
  };
  let t = 0;
  const params = { gravity: BALLISTICS.gravity, dragK };
  while (-s.pos.z < distanceM) {
    const next = stepBullet(s, wind, BULLET_DT, params);
    if (-next.pos.z >= distanceM) {
      const f = (distanceM + s.pos.z) / (s.pos.z - next.pos.z);
      return {
        x: s.pos.x + (next.pos.x - s.pos.x) * f,
        y: s.pos.y + (next.pos.y - s.pos.y) * f,
        t: t + BULLET_DT * f,
        speed: length(next.vel),
      };
    }
    s = next;
    t += BULLET_DT;
  }
  throw new Error("unreachable");
}

describe("stepBullet", () => {
  it("matches the exact vacuum solution when drag is zero", () => {
    let s: BulletState = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: -850 } };
    const params = { gravity: 9.81, dragK: 0 };
    for (let i = 0; i < 120; i++) s = stepBullet(s, STILL, BULLET_DT, params); // 0.5 s
    expect(s.pos.y).toBeCloseTo(-0.5 * 9.81 * 0.25, 9);
    expect(s.pos.z).toBeCloseTo(-425, 9);
    expect(s.vel.y).toBeCloseTo(-9.81 * 0.5, 9);
  });

  it("gives the fixed expected drop at 300 m (reference from an independent fine-step solver)", () => {
    // Reference: midpoint integration with dt = 1e-5 s, same equation and constants (dragK 0.00085).
    // Drop 0.7296 m, time of flight 0.4020 s, remaining speed 658.7 m/s.
    const r = flyTo(300);
    expect(r.y).toBeCloseTo(-0.7296, 3);
    expect(r.t).toBeCloseTo(0.402, 3);
    expect(r.speed).toBeGreaterThan(657);
    expect(r.speed).toBeLessThan(660);
  });

  it("drops more with drag than in vacuum at the same distance", () => {
    expect(flyTo(450).y).toBeLessThan(flyTo(450, STILL, 0).y);
    expect(flyTo(450).y).toBeCloseTo(-1.804, 2);
  });

  it("drifts in the wind's direction, by the expected amount", () => {
    const right = flyTo(300, { x: 5, y: 0, z: 0 });
    const left = flyTo(300, { x: -5, y: 0, z: 0 });
    expect(right.x).toBeGreaterThan(0);
    expect(left.x).toBeLessThan(0);
    // Reference 0.2454 m; equals the lag rule wind * (t - distance / muzzleSpeed).
    expect(right.x).toBeCloseTo(0.2454, 3);
    expect(left.x).toBeCloseTo(-right.x, 9);
  });

  it("has no sideways drift from a head or tail wind", () => {
    expect(flyTo(300, { x: 0, y: 0, z: 4 }).x).toBe(0);
    expect(flyTo(300, { x: 0, y: 0, z: -4 }).x).toBe(0);
  });

  it("has no horizontal drag when moving with the air", () => {
    // Horizontal velocity equals the wind, so only gravity (and a tiny vertical drag) acts.
    const wind = { x: 3, y: 0, z: -2 };
    const s = stepBullet({ pos: STILL, vel: wind }, wind, 0.1);
    expect(s.vel.x).toBeCloseTo(3, 12);
    expect(s.vel.z).toBeCloseTo(-2, 12);
    expect(s.vel.y).toBeCloseTo(-0.981, 4);
  });

  it("is deterministic", () => {
    const a = flyTo(400, { x: 2, y: 0, z: 1 });
    const b = flyTo(400, { x: 2, y: 0, z: 1 });
    expect(a).toEqual(b);
  });
});

describe("muzzleVelocity", () => {
  it("normalizes the direction and applies the server's muzzle speed", () => {
    const v = muzzleVelocity({ x: 0, y: 0, z: -10 });
    expect(v).toEqual({ x: 0, y: 0, z: -BALLISTICS.muzzleSpeed });
  });
});

describe("zeroing", () => {
  it("puts the bullet on the line of sight at the zero distance", () => {
    for (const d of RIFLE.zeroing) {
      const pitch = solveZeroPitch(d);
      expect(Math.abs(heightAtDistance(pitch, d))).toBeLessThan(0.001);
    }
  });

  it("needs more elevation for longer zero distances", () => {
    const p = zeroPitches();
    expect(p).toHaveLength(4);
    for (let i = 1; i < p.length; i++) {
      expect(p[i] ?? 0).toBeGreaterThan(p[i - 1] ?? 0);
    }
  });

  it("shoots high before the zero distance and low after it", () => {
    const pitch300 = solveZeroPitch(300);
    expect(heightAtDistance(pitch300, 150)).toBeGreaterThan(0);
    expect(heightAtDistance(pitch300, 400)).toBeLessThan(0);
  });
});

describe("launchState", () => {
  it("hits the line of sight at the selected zero distance", () => {
    const eye = { x: 3, y: 10, z: 0 };
    RIFLE.zeroing.forEach((d, i) => {
      let s = launchState(eye, 0, 0, i);
      while (-s.pos.z < d) s = stepBullet(s, STILL, BULLET_DT);
      // within one step (3.5 m) of the zero distance the path is still within 2 cm of the sight line
      expect(Math.abs(s.pos.y - eye.y)).toBeLessThan(0.02);
      expect(s.pos.x).toBeCloseTo(3, 9);
    });
  });

  it("starts below the eye by the sight height, at the muzzle speed", () => {
    const s = launchState({ x: 0, y: 2, z: 0 }, 0.4, 0.1, 0);
    expect(s.pos.y).toBeCloseTo(2 - BALLISTICS.sightHeightM, 12);
    expect(length(s.vel)).toBeCloseTo(BALLISTICS.muzzleSpeed, 9);
  });
});
