/**
 * Player movement shared by client prediction and the server (master sections 2, 5, 13).
 * - Speed depends on posture (PLAYER.speed).
 * - No movement while scoped (master section 2).
 * - The player never leaves their own zone (D-018); the server applies the same rule.
 * - Height follows the terrain grid.
 */
import { PLAYER } from "./constants";
import { clampToZone } from "./maps";
import type { PlayerZone } from "./maps";
import type { ClientInput, Vec3 } from "./messages";
import { sampleHeight } from "./terrain";
import type { HeightGrid } from "./terrain";

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
): Vec3 {
  let mx = input.scoped ? 0 : input.moveX;
  let mz = input.scoped ? 0 : input.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const speed = PLAYER.speed[input.posture];
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
  const dx = (cos * mx - sin * mz) * speed * dt;
  const dz = (-sin * mx - cos * mz) * speed * dt;
  const p = clampToZone(zone, feet.x + dx, feet.z + dz);
  return { x: p.x, y: sampleHeight(grid, p.x, p.z), z: p.z };
}
