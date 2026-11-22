/**
 * Deterministic wind (master section 7 and 8).
 * The server sends only the match seed; both sides compute the same wind for any time.
 * Wind is horizontal and uniform across the map, and changes slowly
 * (cycles between WIND.minPeriodS and WIND.maxPeriodS).
 *
 * Direction convention: the angle in the XZ plane, measured from +X toward +Z,
 * of the direction the wind blows TOWARD.
 */
import { WIND } from "./constants";
import { createRng } from "./geometry";
import type { Vec3 } from "./messages";

interface WindShape {
  p1: number;
  p2: number;
  p3: number;
  f1: number;
  f2: number;
  f3: number;
  baseDir: number;
  meanFrac: number;
}

const TWO_PI = Math.PI * 2;

function shapeFor(seed: number): WindShape {
  const r = createRng(seed ^ 0x57494e44);
  const period = () => WIND.minPeriodS + (WIND.maxPeriodS - WIND.minPeriodS) * r();
  return {
    p1: period(),
    p2: period(),
    p3: period(),
    f1: r() * TWO_PI,
    f2: r() * TWO_PI,
    f3: r() * TWO_PI,
    baseDir: r() * TWO_PI,
    meanFrac: 0.35 + 0.3 * r(),
  };
}

/** Wind speed (m/s) and direction (radians) at a time, for HUD, flag, and rangefinder. */
export function windSpeedAndDirection(
  timeS: number,
  seed: number,
): { speed: number; directionRad: number } {
  const s = shapeFor(seed);
  let frac =
    s.meanFrac +
    0.25 * Math.sin((TWO_PI * timeS) / s.p1 + s.f1) +
    0.1 * Math.sin((TWO_PI * timeS) / s.p2 + s.f2);
  if (frac < 0) frac = 0;
  if (frac > 1) frac = 1;
  const directionRad = s.baseDir + 0.5 * Math.sin((TWO_PI * timeS) / s.p3 + s.f3);
  return { speed: WIND.maxSpeed * frac, directionRad };
}

/** Horizontal wind velocity vector (m/s) at a time. y is always 0. */
export function windAt(timeS: number, seed: number): Vec3 {
  const { speed, directionRad } = windSpeedAndDirection(timeS, seed);
  return { x: Math.cos(directionRad) * speed, y: 0, z: Math.sin(directionRad) * speed };
}
