/**
 * Player movement shared by client prediction and the server (master sections 2, 5, 13).
 * - Speed depends on posture (PLAYER.speed).
 * - Scoped movement is a slow creep (D-035; replaces "no movement while scoped").
 * - Rocks and crates block the player (D-031, D-032).
 * - The player never leaves their own zone (D-018); the server applies the same rule.
 * - Height follows the terrain grid.
 */
import { PLAYER, SCOPE } from "./constants";
import { toBoxLocal } from "./geometry";
import type { Ellipsoid } from "./geometry";
import { clampToZone } from "./maps";
import type { CrateProp, PlayerZone } from "./maps";
import type { ClientInput, Vec3 } from "./messages";
import { sampleHeight } from "./terrain";
import type { HeightGrid } from "./terrain";

/** Horizontal body radius used to keep the player out of rocks and props (meters). */
export const PLAYER_RADIUS_M = 0.4;

/** Body height by posture, for deciding whether a rock is in the way (meters). */
const BODY_HEIGHT_M = { stand: 1.7, crouch: 1.0, prone: 0.4 } as const;

/**
 * Pushes a position out of every solid obstacle (D-031). The player slides along the surface
 * instead of stopping dead. Two passes settle the corner between two touching rocks.
 */
export function pushOutOfSolids(
  x: number,
  y: number,
  z: number,
  posture: MoveInput["posture"],
  solids: readonly Ellipsoid[],
): { x: number; z: number } {
  const top = y + BODY_HEIGHT_M[posture];
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (const e of solids) {
      const bottomE = e.center.y - e.radiusY;
      const topE = e.center.y + e.radiusY;
      if (top < bottomE || y > topE) continue;
      // Widest horizontal slice of the rock inside the player's body span.
      const yClosest = Math.min(Math.max(e.center.y, y), top);
      const t = (yClosest - e.center.y) / e.radiusY;
      const slice = e.radiusXZ * Math.sqrt(Math.max(0, 1 - t * t));
      const need = slice + PLAYER_RADIUS_M;
      const dx = px - e.center.x;
      const dz = pz - e.center.z;
      const d = Math.hypot(dx, dz);
      if (d >= need) continue;
      if (d < 1e-6) {
        px = e.center.x + need;
      } else {
        px = e.center.x + (dx / d) * need;
        pz = e.center.z + (dz / d) * need;
      }
    }
  }
  return { x: px, z: pz };
}

/** Pushes a position out of every crate (oriented boxes), sliding along the faces. */
export function pushOutOfCrates(
  x: number,
  y: number,
  z: number,
  posture: MoveInput["posture"],
  crates: readonly CrateProp[],
): { x: number; z: number } {
  const top = y + BODY_HEIGHT_M[posture];
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of crates) {
      const b = c.box;
      if (top < b.center.y - b.half.y || y > b.center.y + b.half.y) continue;
      const l = toBoxLocal(b.rotY, px - b.center.x, pz - b.center.z);
      const hx = b.half.x + PLAYER_RADIUS_M;
      const hz = b.half.z + PLAYER_RADIUS_M;
      if (Math.abs(l.x) >= hx || Math.abs(l.z) >= hz) continue;
      // Push out along the face with the least penetration.
      const penX = hx - Math.abs(l.x);
      const penZ = hz - Math.abs(l.z);
      let lx = l.x;
      let lz = l.z;
      if (penX < penZ) lx = (l.x >= 0 ? 1 : -1) * hx;
      else lz = (l.z >= 0 ? 1 : -1) * hz;
      // Back to world: rotate by +rotY.
      const c0 = Math.cos(b.rotY);
      const s0 = Math.sin(b.rotY);
      px = b.center.x + lx * c0 + lz * s0;
      pz = b.center.z - lx * s0 + lz * c0;
    }
  }
  return { x: px, z: pz };
}

export type MoveInput = Pick<ClientInput, "moveX" | "moveZ" | "yaw" | "posture" | "scoped">;

/**
 * Advances a player's feet position by one step.
 * moveX: +1 right, -1 left. moveZ: +1 forward, -1 back (relative to yaw).
 */
export function stepMovement(
  feet: Vec3,
  input: MoveInput,
  dt: number,
  zone: PlayerZone,
  grid: HeightGrid,
  solids: readonly Ellipsoid[] = [],
  crates: readonly CrateProp[] = [],
): Vec3 {
  let mx = input.moveX;
  let mz = input.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const speed = PLAYER.speed[input.posture] * (input.scoped ? SCOPE.creepSpeedFactor : 1);
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
  const dx = (cos * mx - sin * mz) * speed * dt;
  const dz = (-sin * mx - cos * mz) * speed * dt;
  const nx = feet.x + dx;
  const nz = feet.z + dz;
  const out = pushOutOfSolids(nx, sampleHeight(grid, nx, nz), nz, input.posture, solids);
  const outC = pushOutOfCrates(
    out.x,
    sampleHeight(grid, out.x, out.z),
    out.z,
    input.posture,
    crates,
  );
  const p = clampToZone(zone, outC.x, outC.z);
  return { x: p.x, y: sampleHeight(grid, p.x, p.z), z: p.z };
}
