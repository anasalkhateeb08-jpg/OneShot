import { describe, expect, it } from "vitest";
import { segmentModel } from "./models";
import type { ModelProp } from "./models";

const sandbags: ModelProp = {
  type: "sandbag_barrier",
  center: { x: 0, y: 0.25, z: 0 },
  half: { x: 1.2, y: 0.25, z: 0.2 },
  rotY: 0,
  collision: "solid",
};

describe("placed models (D-054)", () => {
  it("stops a bullet that meets a solid model", () => {
    const t = segmentModel({ x: 0, y: 0.25, z: 5 }, { x: 0, y: 0.25, z: -5 }, sandbags);
    expect(t).not.toBeNull();
    expect(t ?? 0).toBeCloseTo(0.48);
  });

  it("lets a bullet pass just over it", () => {
    expect(segmentModel({ x: 0, y: 0.6, z: 5 }, { x: 0, y: 0.6, z: -5 }, sandbags)).toBeNull();
  });

  it("never blocks with a decoration model", () => {
    const wire: ModelProp = { ...sandbags, collision: "none" };
    expect(segmentModel({ x: 0, y: 0.25, z: 5 }, { x: 0, y: 0.25, z: -5 }, wire)).toBeNull();
  });

  it("follows a tilt: a model laid on its side is lower", () => {
    const onSide: ModelProp = { ...sandbags, rotZ: Math.PI / 2 };
    // Laid on its side the 2.4 m length stands up: a bullet at 1 m height now hits it.
    const t = segmentModel({ x: 0, y: 1, z: 5 }, { x: 0, y: 1, z: -5 }, onSide);
    expect(t).not.toBeNull();
  });
});
