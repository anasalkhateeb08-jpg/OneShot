/**
 * Impact-point prediction for the PRACTICE coach (D-028): where would the bullet land, relative
 * to the crosshair, if fired now at a target `distanceM` away? Expressed in mils (milliradians),
 * the same unit as the mil-dot reticle, so it can be drawn as a dot and explained as a hold.
 * Never used in real duels (owner decision): there the player reads wind and drop alone.
 */
import { BULLET_DT, launchState, stepBullet } from "./ballistics";
import { BALLISTICS } from "./constants";
import { directionFromYawPitch, dot, sub } from "./geometry";
import type { Vec3 } from "./messages";

export interface ImpactPrediction {
  /** Impact offset from the crosshair: + right, - left (mils). */
  rightMils: number;
  /** Impact offset from the crosshair: + above, - below (mils). */
  upMils: number;
  /** Time for the bullet to reach the distance (s). */
  flightS: number;
}

/**
 * @param windAtTime wind at a time offset from now (seconds after firing)
 * @returns null if the bullet cannot reach that distance within its maximum flight time
 */
export function predictImpact(
  eye: Vec3,
  aimYaw: number,
  aimPitch: number,
  zeroIndex: number,
  distanceM: number,
  windAtTime: (secondsAfterFiring: number) => Vec3,
): ImpactPrediction | null {
  const forward = directionFromYawPitch(aimYaw, aimPitch);
  const right: Vec3 = { x: Math.cos(aimYaw), y: 0, z: -Math.sin(aimYaw) };
  // up = right x forward (perpendicular to the line of sight)
  const up: Vec3 = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };

  let s = launchState(eye, aimYaw, aimPitch, zeroIndex);
  let t = 0;
  let along = dot(sub(s.pos, eye), forward);
  while (t < BALLISTICS.maxFlightSeconds) {
    const next = stepBullet(s, windAtTime(t), BULLET_DT);
    const nextAlong = dot(sub(next.pos, eye), forward);
    if (nextAlong >= distanceM) {
      const f = (distanceM - along) / (nextAlong - along);
      const p = {
        x: s.pos.x + (next.pos.x - s.pos.x) * f,
        y: s.pos.y + (next.pos.y - s.pos.y) * f,
        z: s.pos.z + (next.pos.z - s.pos.z) * f,
      };
      const offset = sub(p, {
        x: eye.x + forward.x * distanceM,
        y: eye.y + forward.y * distanceM,
        z: eye.z + forward.z * distanceM,
      });
      return {
        rightMils: (dot(offset, right) / distanceM) * 1000,
        upMils: (dot(offset, up) / distanceM) * 1000,
        flightS: t + BULLET_DT * f,
      };
    }
    s = next;
    along = nextAlong;
    t += BULLET_DT;
  }
  return null;
}

/** Wind component across the line of sight: + blowing toward the shooter's right (m/s). */
export function crosswind(wind: Vec3, aimYaw: number): number {
  return wind.x * Math.cos(aimYaw) - wind.z * Math.sin(aimYaw);
}
