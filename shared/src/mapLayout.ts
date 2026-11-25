/**
 * Hand-editable map layouts (D-049). A layout file holds the props of ONE half of a map, the
 * half of player A; the other half is always added by mirroring through the map center,
 * (x, z) -> (-x, -z), so both players see the same scene from their own side.
 * Heights are stored relative to the ground, so a prop moved in the editor stays on the sand.
 * The in-game editor (phase 1 tooling) reads and writes these files.
 */
import { mirrorCrate, mirrorXZ } from "./maps";
import type { CrateProp, RockProp, ShrubProp } from "./maps";

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

export interface MapLayout {
  version: 1;
  /** Id of the map this layout belongs to. */
  map: string;
  rocks: LayoutRock[];
  crates: LayoutCrate[];
  shrubs: LayoutShrub[];
}

export type HeightFn = (x: number, z: number) => number;

/** World rock from a layout entry. */
export function rockFromLayout(r: LayoutRock, heightAt: HeightFn): RockProp {
  const y = heightAt(r.x, r.z) + r.radiusY * (2 * ROCK_ABOVE_GROUND - 1) + r.lift;
  return {
    collider: { center: { x: r.x, y, z: r.z }, radiusXZ: r.radiusXZ, radiusY: r.radiusY },
    variant: r.variant,
    rotY: r.rotY,
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
}

/**
 * All props of a map from its layout: the authored half first, then its mirror. The order is
 * fixed (index i and index i + half are a mirrored pair), which the editor relies on.
 */
export function propsFromLayout(layout: MapLayout, heightAt: HeightFn): LayoutProps {
  const rocks = layout.rocks.map((r) => rockFromLayout(r, heightAt));
  const crates = layout.crates.map((c) => crateFromLayout(c, heightAt));
  const shrubs = layout.shrubs.map((s) => shrubFromLayout(s, heightAt));
  return {
    rocks: [...rocks, ...rocks.map(mirrorRock)],
    crates: [...crates, ...crates.map(mirrorCrate)],
    shrubs: [...shrubs, ...shrubs.map(mirrorShrub)],
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
  list("rocks", ["x", "z", "radiusXZ", "radiusY", "lift", "rotY", "variant"]);
  list("crates", ["x", "z", "base", "rotY", "lean", "variant"]).forEach((c, i) => {
    const h = c.half as Record<string, unknown> | undefined;
    if (!h || !isNum(h.x) || !isNum(h.y) || !isNum(h.z)) fail(`crates[${i}].half is invalid`);
  });
  list("shrubs", ["x", "z", "scale"]);
  return data as MapLayout;
}
