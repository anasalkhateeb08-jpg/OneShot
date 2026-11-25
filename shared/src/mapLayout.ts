/**
 * Hand-editable map layouts (D-049). A layout file holds the props of ONE half of a map, the
 * half of player A; the other half is always added by mirroring through the map center,
 * (x, z) -> (-x, -z), so both players see the same scene from their own side.
 * Heights are stored relative to the ground, so a prop moved in the editor stays on the sand.
 * The in-game editor (phase 1 tooling) reads and writes these files.
 */
import { mirrorCrate, mirrorXZ } from "./maps";
import type { CrateProp, RockProp, ShrubProp } from "./maps";
import { modelType } from "./models";
import type { ModelProp } from "./models";

/** Fraction of a rock's height kept above the ground by default (the rest is buried). */
export const ROCK_ABOVE_GROUND = 0.65;

export interface LayoutRock {
  x: number;
  z: number;
  radiusXZ: number;
  radiusY: number;
  /** Extra height over the default half-buried position (meters, may be negative). */
  lift: number;
  rotY: number;
  /** Tilt around the rock's own X, then Z axis (radians, optional, D-051). */
  rotX?: number;
  rotZ?: number;
  variant: number;
}

export interface LayoutCrate {
  x: number;
  z: number;
  /** Height of the crate's bottom above the ground under its center (meters). */
  base: number;
  half: { x: number; y: number; z: number };
  rotY: number;
  lean: number;
  variant: number;
}

export interface LayoutShrub {
  x: number;
  z: number;
  scale: number;
}

/** A placed model (D-054). Its bottom sits `lift` meters above the ground under its center. */
export interface LayoutModel {
  type: string;
  x: number;
  z: number;
  lift: number;
  rotY: number;
  rotX?: number;
  rotZ?: number;
  /** Size multiplier per axis (1 = the model's real size). */
  scale: { x: number; y: number; z: number };
}

export interface MapLayout {
  version: 1;
  /** Id of the map this layout belongs to. */
  map: string;
  rocks: LayoutRock[];
  crates: LayoutCrate[];
  shrubs: LayoutShrub[];
  /** Placed models (D-054); missing in older files, read as empty. */
  models: LayoutModel[];
}

export type HeightFn = (x: number, z: number) => number;

/** World rock from a layout entry. */
export function rockFromLayout(r: LayoutRock, heightAt: HeightFn): RockProp {
  const y = heightAt(r.x, r.z) + r.radiusY * (2 * ROCK_ABOVE_GROUND - 1) + r.lift;
  return {
    collider: { center: { x: r.x, y, z: r.z }, radiusXZ: r.radiusXZ, radiusY: r.radiusY },
    variant: r.variant,
    rotY: r.rotY,
    ...(r.rotX ? { rotX: r.rotX } : {}),
    ...(r.rotZ ? { rotZ: r.rotZ } : {}),
  };
}

/** World crate from a layout entry. */
export function crateFromLayout(c: LayoutCrate, heightAt: HeightFn): CrateProp {
  const y = heightAt(c.x, c.z) + c.base + c.half.y;
  return {
    box: {
      center: { x: c.x, y, z: c.z },
      half: { x: c.half.x, y: c.half.y, z: c.half.z },
      rotY: c.rotY,
    },
    lean: c.lean,
    variant: c.variant,
  };
}

/** World shrub from a layout entry. */
export function shrubFromLayout(s: LayoutShrub, heightAt: HeightFn): ShrubProp {
  return { pos: { x: s.x, y: heightAt(s.x, s.z), z: s.z }, scale: s.scale };
}

/** World model from a layout entry (null for an unknown model type). */
export function modelFromLayout(m: LayoutModel, heightAt: HeightFn): ModelProp | null {
  const type = modelType(m.type);
  if (!type) return null;
  const half = {
    x: (type.size.x * m.scale.x) / 2,
    y: (type.size.y * m.scale.y) / 2,
    z: (type.size.z * m.scale.z) / 2,
  };
  return {
    type: m.type,
    center: { x: m.x, y: heightAt(m.x, m.z) + m.lift + half.y, z: m.z },
    half,
    rotY: m.rotY,
    ...(m.rotX ? { rotX: m.rotX } : {}),
    ...(m.rotZ ? { rotZ: m.rotZ } : {}),
    collision: type.collision,
  };
}

export function mirrorModel(m: ModelProp): ModelProp {
  return { ...m, center: mirrorXZ(m.center), rotY: m.rotY + Math.PI };
}

export function mirrorRock(r: RockProp): RockProp {
  return {
    ...r,
    collider: { ...r.collider, center: mirrorXZ(r.collider.center) },
    rotY: r.rotY + Math.PI,
  };
}

export function mirrorShrub(s: ShrubProp): ShrubProp {
  return { pos: mirrorXZ(s.pos), scale: s.scale };
}

export interface LayoutProps {
  rocks: RockProp[];
  crates: CrateProp[];
  shrubs: ShrubProp[];
  models: ModelProp[];
}

/**
 * All props of a map from its layout: the authored half first, then its mirror. The order is
 * fixed (index i and index i + half are a mirrored pair), which the editor relies on.
 */
export function propsFromLayout(layout: MapLayout, heightAt: HeightFn): LayoutProps {
  const rocks = layout.rocks.map((r) => rockFromLayout(r, heightAt));
  const crates = layout.crates.map((c) => crateFromLayout(c, heightAt));
  const shrubs = layout.shrubs.map((s) => shrubFromLayout(s, heightAt));
  // An unknown model type (e.g. removed from MODEL_TYPES) produces no model on either side.
  const models = layout.models
    .map((m) => modelFromLayout(m, heightAt))
    .filter((m): m is ModelProp => m !== null);
  return {
    rocks: [...rocks, ...rocks.map(mirrorRock)],
    crates: [...crates, ...crates.map(mirrorCrate)],
    shrubs: [...shrubs, ...shrubs.map(mirrorShrub)],
    models: [...models, ...models.map(mirrorModel)],
  };
}

/**
 * Checks a parsed layout file and returns it typed, or throws with a clear message. Used when
 * the editor saves, so a broken file never reaches the game.
 */
export function parseLayout(data: unknown): MapLayout {
  const fail = (msg: string): never => {
    throw new Error(`Invalid map layout: ${msg}`);
  };
  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (typeof data !== "object" || data === null) return fail("not an object");
  const d = data as Record<string, unknown>;
  if (d.version !== 1) fail("version must be 1");
  if (typeof d.map !== "string") fail("map id missing");
  const list = (key: string, fields: readonly string[]): Record<string, unknown>[] => {
    const arr = d[key];
    if (!Array.isArray(arr)) return fail(`${key} must be a list`);
    arr.forEach((item: unknown, i) => {
      if (typeof item !== "object" || item === null) fail(`${key}[${i}] is not an object`);
      for (const f of fields) {
        if (!isNum((item as Record<string, unknown>)[f])) fail(`${key}[${i}].${f} is not a number`);
      }
    });
    return arr as Record<string, unknown>[];
  };
  list("rocks", ["x", "z", "radiusXZ", "radiusY", "lift", "rotY", "variant"]).forEach((r, i) => {
    for (const f of ["rotX", "rotZ"]) {
      if (r[f] !== undefined && !isNum(r[f])) fail(`rocks[${i}].${f} is not a number`);
    }
  });
  list("crates", ["x", "z", "base", "rotY", "lean", "variant"]).forEach((c, i) => {
    const h = c.half as Record<string, unknown> | undefined;
    if (!h || !isNum(h.x) || !isNum(h.y) || !isNum(h.z)) fail(`crates[${i}].half is invalid`);
  });
  list("shrubs", ["x", "z", "scale"]);
  if (d.models === undefined) d.models = [];
  list("models", ["x", "z", "lift", "rotY"]).forEach((m, i) => {
    if (typeof m.type !== "string") fail(`models[${i}].type is missing`);
    const s = m.scale as Record<string, unknown> | undefined;
    if (!s || !isNum(s.x) || !isNum(s.y) || !isNum(s.z)) fail(`models[${i}].scale is invalid`);
    for (const f of ["rotX", "rotZ"]) {
      if (m[f] !== undefined && !isNum(m[f])) fail(`models[${i}].${f} is not a number`);
    }
  });
  return data as MapLayout;
}
