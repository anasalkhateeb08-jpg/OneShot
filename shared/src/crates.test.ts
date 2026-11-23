import { describe, expect, it } from "vitest";
import { CRATE_FACES, crateFaceAt } from "./crates";
import { rayBoxSpan } from "./geometry";

const box = { center: { x: 10, y: 2, z: 5 }, half: { x: 0.5, y: 0.4, z: 1 }, rotY: 0 };

describe("crate faces", () => {
  it("has right-handed faces: u x v equals the outward normal", () => {
    for (const f of CRATE_FACES) {
      const c = [
        f.u[1] * f.v[2] - f.u[2] * f.v[1],
        f.u[2] * f.v[0] - f.u[0] * f.v[2],
        f.u[0] * f.v[1] - f.u[1] * f.v[0],
      ];
      expect(c.map((v) => v + 0)).toEqual([...f.n]);
    }
  });

  it("finds the +Z face and its center", () => {
    const r = crateFaceAt(box, { x: 10, y: 2, z: 6 });
    expect(r.face).toBe(4);
    expect(r.fu).toBeCloseTo(0.5, 9);
    expect(r.fv).toBeCloseTo(0.5, 9);
    expect(r.sizeU).toBeCloseTo(1, 9);
    expect(r.sizeV).toBeCloseTo(0.8, 9);
  });

  it("puts a point near the top-right corner of the +Z face near (1, 1)", () => {
    const r = crateFaceAt(box, { x: 10.45, y: 2.35, z: 6 });
    expect(r.face).toBe(4);
    expect(r.fu).toBeCloseTo(0.95, 9);
    expect(r.fv).toBeCloseTo(0.9375, 9);
  });

  it("finds the -X face and the +X face", () => {
    expect(crateFaceAt(box, { x: 9.5, y: 2, z: 5 }).face).toBe(1);
    const plusX = crateFaceAt(box, { x: 10.5, y: 2, z: 4.2 });
    expect(plusX.face).toBe(0);
    // On +X, u points toward -Z: z below the center is toward the right.
    expect(plusX.fu).toBeGreaterThan(0.5);
  });

  it("follows the crate's rotation", () => {
    const turned = { ...box, rotY: Math.PI / 2 };
    // Rotated a quarter turn, the long side (local Z) lies along world X.
    const r = crateFaceAt(turned, { x: 10 + 1, y: 2, z: 5 });
    expect([0, 1, 4, 5]).toContain(r.face);
    expect(r.sizeU).toBeGreaterThan(0);
  });

  it("finds where a ray leaves the box (rayBoxSpan)", () => {
    const s = rayBoxSpan({ x: 10, y: 2, z: 0 }, { x: 0, y: 0, z: 1 }, box);
    expect(s?.tIn).toBeCloseTo(4, 9);
    expect(s?.tOut).toBeCloseTo(6, 9);
    expect(rayBoxSpan({ x: 20, y: 2, z: 0 }, { x: 0, y: 0, z: 1 }, box)).toBeNull();
  });
});
