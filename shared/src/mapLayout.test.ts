import { describe, expect, it } from "vitest";
import { DESERT_CANYON } from "./mapDesert";
import { parseLayout, propsFromLayout } from "./mapLayout";
import type { MapLayout } from "./mapLayout";
import type { ModelType } from "./models";
import layoutFile from "./layouts/desert-canyon.json";

const flat = (): number => 10;
const testTypes = (id: string): ModelType | undefined =>
  id === "sandbag_barrier"
    ? { id, label: "Sandbags", size: { x: 2.37, y: 0.53, z: 0.38 }, collision: "solid" }
    : undefined;

const sample: MapLayout = {
  version: 1,
  map: "test",
  rocks: [{ x: 5, z: 40, radiusXZ: 2, radiusY: 1, lift: 0.5, rotY: 0.3, variant: 1 }],
  crates: [
    {
      x: -3,
      z: 60,
      base: -0.05,
      half: { x: 0.4, y: 0.4, z: 0.4 },
      rotY: 0.2,
      lean: 0.01,
      variant: 0,
    },
  ],
  shrubs: [{ x: 1, z: 2, scale: 1.2 }],
  models: [{ type: "sandbag_barrier", x: 4, z: 30, lift: 0, rotY: 0, scale: { x: 2, y: 1, z: 1 } }],
};

describe("map layout (D-049)", () => {
  it("adds the mirrored half after the authored half, in the same order", () => {
    const p = propsFromLayout(sample, flat, testTypes);
    expect(p.rocks).toHaveLength(2);
    expect(p.crates).toHaveLength(2);
    expect(p.shrubs).toHaveLength(2);
    const [a, b] = p.rocks;
    expect(b?.collider.center.x).toBeCloseTo(-(a?.collider.center.x ?? 0));
    expect(b?.collider.center.z).toBeCloseTo(-(a?.collider.center.z ?? 0));
    expect(b?.collider.center.y).toBeCloseTo(a?.collider.center.y ?? 0);
  });

  it("stores heights relative to the ground", () => {
    const p = propsFromLayout(sample, flat);
    // 10 ground + 1 * (2 * 0.65 - 1) buried part + 0.5 lift
    expect(p.rocks[0]?.collider.center.y).toBeCloseTo(10.8);
    // 10 ground - 0.05 base + 0.4 half height
    expect(p.crates[0]?.box.center.y).toBeCloseTo(10.35);
    expect(p.shrubs[0]?.pos.y).toBe(10);
  });

  it("places models on the ground at their real size, mirrored (D-054)", () => {
    const p = propsFromLayout(sample, flat, testTypes);
    expect(p.models).toHaveLength(2);
    const [a, b] = p.models;
    expect(a?.half.x).toBeCloseTo(2.37); // 2.37 m long, scale 2, half of it
    expect(a?.center.y).toBeCloseTo(10 + 0.53 / 2); // bottom on the ground
    expect(b?.center.x).toBeCloseTo(-4);
    expect(b?.center.z).toBeCloseTo(-30);
    expect(b?.rotY).toBeCloseTo(Math.PI);
  });

  it("reads an older file without models as an empty list", () => {
    const old: Record<string, unknown> = { ...sample };
    delete old.models;
    expect(parseLayout(old).models).toEqual([]);
  });

  it("rejects a broken file with a clear message", () => {
    expect(() => parseLayout({ ...sample, version: 2 })).toThrow(/version/);
    expect(() => parseLayout({ ...sample, rocks: [{ x: 1 }] })).toThrow(/rocks\[0\]\.z/);
    expect(() =>
      parseLayout({ ...sample, crates: [{ ...sample.crates[0], half: { x: 1 } }] }),
    ).toThrow(/half/);
  });

  it("builds the desert map from its layout file", () => {
    const layout = parseLayout(layoutFile);
    expect(DESERT_CANYON.rocks).toHaveLength(layout.rocks.length * 2);
    expect(DESERT_CANYON.crates).toHaveLength(layout.crates.length * 2);
    expect(DESERT_CANYON.shrubs).toHaveLength(layout.shrubs.length * 2);
  });
});
