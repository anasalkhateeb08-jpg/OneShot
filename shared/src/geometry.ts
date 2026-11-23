/**
 * Pure vector math and collision tests shared by client and server.
 * Coordinates: meters, Y is up. Yaw 0 looks toward -Z (the Three.js camera default);
 * positive yaw turns left (counterclockwise seen from above); positive pitch looks up.
 */
import type { Vec3 } from "./messages";

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });

/** a + b * s */
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => ({
  x: a.x + b.x * s,
  y: a.y + b.y * s,
  z: a.z + b.z * s,
});

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const length = (a: Vec3): number => Math.sqrt(dot(a, a));

export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));

/** Horizontal (XZ-plane) distance, ignoring height. */
export const horizontalDistance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > 0 ? scale(a, 1 / len) : vec3(0, 0, 0);
}

export const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => addScaled(a, sub(b, a), t);

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/** Wraps an angle to the range (-PI, PI]. */
export function wrapAngle(rad: number): number {
  const twoPi = Math.PI * 2;
  let a = rad % twoPi;
  if (a <= -Math.PI) a += twoPi;
  if (a > Math.PI) a -= twoPi;
  return a;
}

/** Unit view direction from yaw and pitch (radians). */
export function directionFromYawPitch(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** Inverse of directionFromYawPitch. */
export function yawPitchFromDirection(dir: Vec3): { yaw: number; pitch: number } {
  const n = normalize(dir);
  return { yaw: Math.atan2(-n.x, -n.z), pitch: Math.asin(clamp(n.y, -1, 1)) };
}

/** Axis-aligned box. */
export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export interface Sphere {
  center: Vec3;
  radius: number;
}

const AXES = ["x", "y", "z"] as const;
const EPS = 1e-12;

/**
 * First intersection of segment a->b with a box (slab method).
 * @returns t in [0, 1] along the segment (0 if a is inside), or null if no hit.
 */
export function segmentAabb(a: Vec3, b: Vec3, box: Aabb): number | null {
  let tMin = 0;
  let tMax = 1;
  for (const axis of AXES) {
    const start = a[axis];
    const delta = b[axis] - start;
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (Math.abs(delta) < EPS) {
      if (start < lo || start > hi) return null;
      continue;
    }
    let t1 = (lo - start) / delta;
    let t2 = (hi - start) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  return tMin;
}

/**
 * First intersection of segment a->b with a sphere.
 * @returns t in [0, 1] along the segment (0 if a is inside), or null if no hit.
 */
export function segmentSphere(a: Vec3, b: Vec3, sphere: Sphere): number | null {
  const d = sub(b, a);
  const f = sub(a, sphere.center);
  const c = dot(f, f) - sphere.radius * sphere.radius;
  if (c <= 0) return 0;
  const aa = dot(d, d);
  if (aa < EPS) return null;
  const bb = 2 * dot(f, d);
  const disc = bb * bb - 4 * aa * c;
  if (disc < 0) return null;
  const t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}

/** Ellipsoid with a round horizontal section (rocks, boulders). */
export interface Ellipsoid {
  center: Vec3;
  /** Radius along X and Z. */
  radiusXZ: number;
  /** Radius along Y (height). */
  radiusY: number;
}

/**
 * First intersection of segment a->b with an ellipsoid (scaled to a unit sphere; the segment
 * parameter t is unchanged by the scaling).
 * @returns t in [0, 1] (0 if a is inside), or null if no hit.
 */
export function segmentEllipsoid(a: Vec3, b: Vec3, e: Ellipsoid): number | null {
  const toUnit = (p: Vec3): Vec3 => ({
    x: (p.x - e.center.x) / e.radiusXZ,
    y: (p.y - e.center.y) / e.radiusY,
    z: (p.z - e.center.z) / e.radiusXZ,
  });
  return segmentSphere(toUnit(a), toUnit(b), { center: { x: 0, y: 0, z: 0 }, radius: 1 });
}

/** Ellipsoid rotated around the vertical axis (body parts lying along a direction). */
export interface OrientedEllipsoid {
  center: Vec3;
  /** Radii in the part's own frame: x = sideways, y = up, z = along the facing direction. */
  radii: Vec3;
  /** Facing yaw (same convention as the view: yaw 0 faces -Z). */
  yaw: number;
}

/** Segment against a rotated ellipsoid. @returns t in [0, 1] or null. */
export function segmentOrientedEllipsoid(a: Vec3, b: Vec3, e: OrientedEllipsoid): number | null {
  const cos = Math.cos(e.yaw);
  const sin = Math.sin(e.yaw);
  // World -> local: local x = right, local z = forward (forward = (-sin, 0, -cos)).
  const toUnit = (p: Vec3): Vec3 => {
    const dx = p.x - e.center.x;
    const dz = p.z - e.center.z;
    const right = cos * dx - sin * dz;
    const forward = -sin * dx - cos * dz;
    return { x: right / e.radii.x, y: (p.y - e.center.y) / e.radii.y, z: forward / e.radii.z };
  };
  return segmentSphere(toUnit(a), toUnit(b), { center: { x: 0, y: 0, z: 0 }, radius: 1 });
}

/**
 * Small deterministic pseudo-random generator (mulberry32).
 * Same seed gives the same sequence on client and server.
 * @returns a function producing numbers in [0, 1)
 */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
