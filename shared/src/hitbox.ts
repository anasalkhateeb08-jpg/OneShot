/**
 * Human hitbox (master section 3 temporary rules: head or torso = kill, limb = wound).
 * Built from oriented ellipsoids for each posture. Shared: the server decides hits with
 * exactly the same shapes; practice targets use them too.
 */
import { segmentOrientedEllipsoid } from "./geometry";
import type { OrientedEllipsoid } from "./geometry";
import type { HitZone, Posture, Vec3 } from "./messages";

export interface HitboxPart {
  zone: HitZone;
  shape: OrientedEllipsoid;
}

interface PartSpec {
  zone: HitZone;
  /** Offset from the feet in the body frame: x right, y up, z forward. */
  at: Vec3;
  radii: Vec3;
}

const POSES: Record<Posture, readonly PartSpec[]> = {
  stand: [
    { zone: "head", at: { x: 0, y: 1.62, z: 0 }, radii: { x: 0.1, y: 0.13, z: 0.11 } },
    { zone: "torso", at: { x: 0, y: 1.22, z: 0 }, radii: { x: 0.21, y: 0.33, z: 0.14 } },
    { zone: "limb", at: { x: -0.1, y: 0.45, z: 0 }, radii: { x: 0.09, y: 0.46, z: 0.1 } },
    { zone: "limb", at: { x: 0.1, y: 0.45, z: 0 }, radii: { x: 0.09, y: 0.46, z: 0.1 } },
    { zone: "limb", at: { x: -0.28, y: 1.15, z: 0.05 }, radii: { x: 0.06, y: 0.3, z: 0.07 } },
    { zone: "limb", at: { x: 0.28, y: 1.15, z: 0.05 }, radii: { x: 0.06, y: 0.3, z: 0.07 } },
  ],
  crouch: [
    { zone: "head", at: { x: 0, y: 1.05, z: 0.12 }, radii: { x: 0.1, y: 0.13, z: 0.11 } },
    { zone: "torso", at: { x: 0, y: 0.72, z: 0.05 }, radii: { x: 0.21, y: 0.28, z: 0.16 } },
    { zone: "limb", at: { x: 0, y: 0.25, z: 0.05 }, radii: { x: 0.24, y: 0.25, z: 0.3 } },
  ],
  prone: [
    { zone: "head", at: { x: 0, y: 0.3, z: 0.85 }, radii: { x: 0.1, y: 0.12, z: 0.12 } },
    { zone: "torso", at: { x: 0, y: 0.2, z: 0.35 }, radii: { x: 0.22, y: 0.15, z: 0.36 } },
    { zone: "limb", at: { x: 0, y: 0.12, z: -0.5 }, radii: { x: 0.2, y: 0.11, z: 0.52 } },
  ],
};

/** Hitbox parts for a body standing at `feet` facing `yaw` in `posture`. */
export function hitboxParts(feet: Vec3, yaw: number, posture: Posture): HitboxPart[] {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return POSES[posture].map((p) => {
    // body right = (cos, 0, -sin), body forward = (-sin, 0, -cos)
    const wx = feet.x + cos * p.at.x - sin * p.at.z;
    const wz = feet.z - sin * p.at.x - cos * p.at.z;
    return {
      zone: p.zone,
      shape: { center: { x: wx, y: feet.y + p.at.y, z: wz }, radii: p.radii, yaw },
    };
  });
}

export interface BodyHit {
  t: number;
  zone: HitZone;
}

/** First body part hit by segment a->b, or null. */
export function segmentHitbox(a: Vec3, b: Vec3, parts: readonly HitboxPart[]): BodyHit | null {
  let best: BodyHit | null = null;
  for (const part of parts) {
    const t = segmentOrientedEllipsoid(a, b, part.shape);
    if (t !== null && (best === null || t < best.t)) best = { t, zone: part.zone };
  }
  return best;
}

/** Temporary rule (master section 3): head or torso is a kill. */
export const isLethalZone = (zone: HitZone): boolean => zone === "head" || zone === "torso";
