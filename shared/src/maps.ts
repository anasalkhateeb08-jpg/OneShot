/**
 * Map definitions (D-018). A map is DATA: terrain shape, two mirrored player zones,
 * colliders, decoration, and atmosphere. A new map adds data and assets, not game code.
 * Shared because the server needs the same terrain, zones, and colliders as the client.
 */
import { smoothstep } from "./noise";
import type { Aabb, Ellipsoid } from "./geometry";
import type { GridSpec } from "./terrain";
import type { Vec3 } from "./messages";

/**
 * A player's own area. Axis-aligned: width along X, depth along Z.
 * The player can move sideways and forward/back inside it, never outside.
 */
export interface PlayerZone {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfDepth: number;
  /** Yaw the player faces at spawn (toward the opponent). */
  facingYaw: number;
  spawnX: number;
  spawnZ: number;
}

export type WallMaterial = "mudbrick" | "stone" | "concrete";

export interface WallProp {
  box: Aabb;
  material: WallMaterial;
}

/** A rock or boulder. The visual shape is built to match the collider ellipsoid. */
export interface RockProp {
  collider: Ellipsoid;
  /** Visual variant index. */
  variant: number;
  /** Visual rotation around Y. */
  rotY: number;
}

export interface ShrubProp {
  pos: Vec3;
  scale: number;
}

export interface Atmosphere {
  skyZenith: number;
  skyHorizon: number;
  fogColor: number;
  fogDensity: number;
  /** Unit vector pointing FROM the ground TOWARD the sun. */
  sunDirection: Vec3;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  groundLow: number;
  groundHigh: number;
  rockColor: number;
}

export interface MapDef {
  id: string;
  /** Localization key of the map name (phase 8). */
  nameKey: string;
  grid: GridSpec;
  heightAt(x: number, z: number): number;
  zones: readonly [PlayerZone, PlayerZone];
  walls: readonly WallProp[];
  rocks: readonly RockProp[];
  shrubs: readonly ShrubProp[];
  atmosphere: Atmosphere;
}

/** Clamps a horizontal position into a zone. */
export function clampToZone(zone: PlayerZone, x: number, z: number): { x: number; z: number } {
  const minX = zone.centerX - zone.halfWidth;
  const maxX = zone.centerX + zone.halfWidth;
  const minZ = zone.centerZ - zone.halfDepth;
  const maxZ = zone.centerZ + zone.halfDepth;
  return {
    x: x < minX ? minX : x > maxX ? maxX : x,
    z: z < minZ ? minZ : z > maxZ ? maxZ : z,
  };
}

export function isInZone(zone: PlayerZone, x: number, z: number): boolean {
  return (
    Math.abs(x - zone.centerX) <= zone.halfWidth + 1e-9 &&
    Math.abs(z - zone.centerZ) <= zone.halfDepth + 1e-9
  );
}

/**
 * Distance outside a zone rectangle (0 inside). Used to blend terrain into a zone plateau.
 */
export function distanceOutsideZone(zone: PlayerZone, x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x - zone.centerX) - zone.halfWidth);
  const dz = Math.max(0, Math.abs(z - zone.centerZ) - zone.halfDepth);
  return Math.hypot(dx, dz);
}

/** Weight 1 inside the zone, fading to 0 at `blendM` meters outside it. */
export function zoneBlend(zone: PlayerZone, x: number, z: number, blendM: number): number {
  return 1 - smoothstep(0, blendM, distanceOutsideZone(zone, x, z));
}

/** Mirrors a point through the map center: (x, z) -> (-x, -z). */
export function mirrorXZ(p: Vec3): Vec3 {
  return { x: -p.x, y: p.y, z: -p.z };
}

/** Mirrors a box through the map center. */
export function mirrorBox(b: Aabb): Aabb {
  return {
    min: { x: -b.max.x, y: b.min.y, z: -b.max.z },
    max: { x: -b.min.x, y: b.max.y, z: -b.min.z },
  };
}
