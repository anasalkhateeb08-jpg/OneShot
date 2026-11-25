/**
 * Placed models (D-054): sandbags, barriers, poles and other props that come from Megascans
 * (or any glTF) instead of the code. Each model type has a real size in meters and a collision
 * kind; the map layout places copies of it, the other half of the map is their mirror.
 * Collision uses the model's own triangles when they are loaded (like rocks, D-038), else its
 * box. Walking always uses the box.
 */
import { segmentOrientedBox, segmentSphere, toRotatedLocal } from "./geometry";
import type { Vec3 } from "./messages";
import { segmentUnitMesh } from "./rockMesh";
import type { RockMesh } from "./rockMesh";

/** solid: stops bullets and players (sandbags). none: decoration only (wires, debris). */
export type ModelCollision = "solid" | "none";

export interface ModelType {
  id: string;
  /** Name shown in the editor. */
  label: string;
  /** Full size in meters at scale 1 (x = length, y = height, z = depth). */
  size: Vec3;
  collision: ModelCollision;
}

/** Every model type the game knows. The id is the folder name in .assets-pro. */
export const MODEL_TYPES: readonly ModelType[] = [
  {
    id: "sandbag_barrier",
    label: "Sandbag barrier",
    size: { x: 2.37, y: 0.53, z: 0.38 },
    collision: "solid",
  },
];

export function modelType(id: string): ModelType | undefined {
  return MODEL_TYPES.find((t) => t.id === id);
}

/** A model placed in the world. */
export interface ModelProp {
  type: string;
  center: Vec3;
  /** Half size along the model's own axes (size x scale / 2). */
  half: Vec3;
  rotY: number;
  rotX?: number;
  rotZ?: number;
  collision: ModelCollision;
}

/** World point to the model's unit frame (its box spans -1..1 on every axis). */
function toModelUnit(m: ModelProp, p: Vec3): Vec3 {
  const l = toRotatedLocal(m.rotX ?? 0, m.rotY, m.rotZ ?? 0, {
    x: p.x - m.center.x,
    y: p.y - m.center.y,
    z: p.z - m.center.z,
  });
  return { x: l.x / m.half.x, y: l.y / m.half.y, z: l.z / m.half.z };
}

/**
 * First hit of segment a->b with a solid model: its triangles when known, else its box.
 * @returns t in [0, 1] or null
 */
export function segmentModel(a: Vec3, b: Vec3, m: ModelProp, mesh?: RockMesh): number | null {
  if (m.collision !== "solid") return null;
  const tilted = (m.rotX ?? 0) !== 0 || (m.rotZ ?? 0) !== 0;
  // Fast first check: the box (upright) or the surrounding sphere (tilted).
  const near = tilted
    ? segmentSphere(a, b, { center: m.center, radius: Math.hypot(m.half.x, m.half.y, m.half.z) })
    : segmentOrientedBox(a, b, { center: m.center, half: m.half, rotY: m.rotY });
  if (near === null) return null;
  if (mesh) return segmentUnitMesh(toModelUnit(m, a), toModelUnit(m, b), mesh);
  if (!tilted) return near;
  return segmentUnitBox(toModelUnit(m, a), toModelUnit(m, b));
}

/** Segment against the unit box -1..1 (for a tilted model without its mesh). */
function segmentUnitBox(a: Vec3, b: Vec3): number | null {
  let t0 = 0;
  let t1 = 1;
  for (const k of ["x", "y", "z"] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) {
      if (a[k] < -1 || a[k] > 1) return null;
      continue;
    }
    let s = (-1 - a[k]) / d;
    let e = (1 - a[k]) / d;
    if (s > e) [s, e] = [e, s];
    if (s > t0) t0 = s;
    if (e < t1) t1 = e;
    if (t0 > t1) return null;
  }
  return t0;
}
