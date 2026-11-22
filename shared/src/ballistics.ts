/**
 * Bullet physics shared by client, server, and tests (master section 8, Appendix B).
 *
 *   a = g - k * |v - w| * (v - w)
 *
 * g = (0, -gravity, 0), v = bullet velocity, w = wind velocity at the bullet.
 * Wind enters only through the air-relative velocity, so drift is natural.
 * Integration: classic Runge-Kutta 4 with wind held constant during one step.
 * Pure functions, no internal state: identical inputs give identical outputs everywhere.
 */
import { BALLISTICS, RIFLE, SIM } from "./constants";
import { normalize, scale } from "./geometry";
import type { Vec3 } from "./messages";

export interface BulletState {
  pos: Vec3;
  vel: Vec3;
}

export interface BallisticsParams {
  gravity: number;
  dragK: number;
}

const DEFAULT_PARAMS: BallisticsParams = {
  gravity: BALLISTICS.gravity,
  dragK: BALLISTICS.dragK,
};

/** The fixed bullet integration step (1/240 s). */
export const BULLET_DT = 1 / SIM.bulletSubstepHz;

function accel(vel: Vec3, wind: Vec3, p: BallisticsParams): Vec3 {
  const rx = vel.x - wind.x;
  const ry = vel.y - wind.y;
  const rz = vel.z - wind.z;
  const k = p.dragK * Math.sqrt(rx * rx + ry * ry + rz * rz);
  return { x: -k * rx, y: -p.gravity - k * ry, z: -k * rz };
}

/**
 * Advances a bullet by one time step.
 * @param state position (m) and velocity (m/s)
 * @param wind wind velocity (m/s), constant during the step
 * @param dt step in seconds (normally BULLET_DT)
 */
export function stepBullet(
  state: BulletState,
  wind: Vec3,
  dt: number,
  params: BallisticsParams = DEFAULT_PARAMS,
): BulletState {
  const p0 = state.pos;
  const v0 = state.vel;
  const h = dt / 2;

  const a1 = accel(v0, wind, params);
  const v1 = { x: v0.x + a1.x * h, y: v0.y + a1.y * h, z: v0.z + a1.z * h };
  const a2 = accel(v1, wind, params);
  const v2 = { x: v0.x + a2.x * h, y: v0.y + a2.y * h, z: v0.z + a2.z * h };
  const a3 = accel(v2, wind, params);
  const v3 = { x: v0.x + a3.x * dt, y: v0.y + a3.y * dt, z: v0.z + a3.z * dt };
  const a4 = accel(v3, wind, params);

  const s = dt / 6;
  return {
    pos: {
      x: p0.x + s * (v0.x + 2 * v1.x + 2 * v2.x + v3.x),
      y: p0.y + s * (v0.y + 2 * v1.y + 2 * v2.y + v3.y),
      z: p0.z + s * (v0.z + 2 * v1.z + 2 * v2.z + v3.z),
    },
    vel: {
      x: v0.x + s * (a1.x + 2 * a2.x + 2 * a3.x + a4.x),
      y: v0.y + s * (a1.y + 2 * a2.y + 2 * a3.y + a4.y),
      z: v0.z + s * (a1.z + 2 * a2.z + 2 * a3.z + a4.z),
    },
  };
}

/** Muzzle velocity vector along a direction. The server always sets the speed itself. */
export function muzzleVelocity(direction: Vec3, speed: number = BALLISTICS.muzzleSpeed): Vec3 {
  return scale(normalize(direction), speed);
}

/**
 * Bore height relative to the line of sight at a horizontal distance, for a shot fired along
 * -Z with the given bore pitch, no wind. The bore starts sightHeightM below the sight line.
 * @returns height in meters (positive = above the line of sight), or NaN if out of range
 */
export function heightAtDistance(
  pitchRad: number,
  distanceM: number,
  sightHeightM: number = BALLISTICS.sightHeightM,
  params: BallisticsParams = DEFAULT_PARAMS,
): number {
  const speed = BALLISTICS.muzzleSpeed;
  let state: BulletState = {
    pos: { x: 0, y: -sightHeightM, z: 0 },
    vel: { x: 0, y: Math.sin(pitchRad) * speed, z: -Math.cos(pitchRad) * speed },
  };
  const still = { x: 0, y: 0, z: 0 };
  const maxSteps = Math.ceil(BALLISTICS.maxFlightSeconds / BULLET_DT);
  for (let i = 0; i < maxSteps; i++) {
    const next = stepBullet(state, still, BULLET_DT, params);
    const d0 = -state.pos.z;
    const d1 = -next.pos.z;
    if (d1 >= distanceM) {
      const t = (distanceM - d0) / (d1 - d0);
      return state.pos.y + (next.pos.y - state.pos.y) * t;
    }
    state = next;
  }
  return Number.NaN;
}

/**
 * Bore pitch (radians, upward) that puts the bullet exactly on the line of sight
 * at the zero distance. Solved by bisection; deterministic.
 */
export function solveZeroPitch(
  distanceM: number,
  sightHeightM: number = BALLISTICS.sightHeightM,
  params: BallisticsParams = DEFAULT_PARAMS,
): number {
  let lo = -0.01;
  let hi = 0.05;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const h = heightAtDistance(mid, distanceM, sightHeightM, params);
    if (Number.isNaN(h) || h < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

let zeroCache: readonly number[] | null = null;

/** Bore pitch for each zeroing setting (index matches ClientInput.zeroIndex). */
export function zeroPitches(): readonly number[] {
  if (zeroCache === null) zeroCache = RIFLE.zeroing.map((d) => solveZeroPitch(d));
  return zeroCache;
}
