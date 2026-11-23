/**
 * Crate faces and where a world point lies on them (D-032). The client uses this to paint
 * bullet holes on the right face at the right spot; it is shared so it can be tested.
 */
import { toBoxLocal } from "./geometry";
import type { OrientedBox } from "./geometry";
import type { Vec3 } from "./messages";

type Axes = readonly [number, number, number];

/**
 * The six faces of a unit box. Index = axis * 2 + (negative side ? 1 : 0).
 * n is the outward normal; u points right and v points up when the face is seen from outside
 * (u x v = n).
 */
export const CRATE_FACES: ReadonlyArray<{ n: Axes; u: Axes; v: Axes }> = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

const dot3 = (a: readonly number[], b: readonly number[]): number =>
  (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);

export interface CrateFacePoint {
  face: number;
  /** Position on the face, 0..1: u from left to right, v from bottom to top. */
  fu: number;
  fv: number;
  /** Physical size of the face along u and v, meters. */
  sizeU: number;
  sizeV: number;
}

/** The face of `box` that world point `p` lies on (the nearest one) and where on that face. */
export function crateFaceAt(box: OrientedBox, p: Vec3): CrateFacePoint {
  const l = toBoxLocal(box.rotY, p.x - box.center.x, p.z - box.center.z);
  const size = [box.half.x * 2, box.half.y * 2, box.half.z * 2];
  const unit = [l.x / (size[0] || 1), (p.y - box.center.y) / (size[1] || 1), l.z / (size[2] || 1)];
  let axis = 0;
  for (let k = 1; k < 3; k++) {
    if (Math.abs(unit[k] ?? 0) > Math.abs(unit[axis] ?? 0)) axis = k;
  }
  const face = axis * 2 + ((unit[axis] ?? 0) < 0 ? 1 : 0);
  const f = CRATE_FACES[face] ?? CRATE_FACES[0];
  const u = f?.u ?? [1, 0, 0];
  const v = f?.v ?? [0, 1, 0];
  return {
    face,
    fu: dot3(unit, u) + 0.5,
    fv: dot3(unit, v) + 0.5,
    sizeU: Math.abs(dot3(size, u)) || 1,
    sizeV: Math.abs(dot3(size, v)) || 1,
  };
}
