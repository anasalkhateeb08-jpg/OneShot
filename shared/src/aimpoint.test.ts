import { describe, expect, it } from "vitest";
import { crosswind, predictImpact } from "./aimpoint";

const eye = { x: 0, y: 10, z: 0 };
const still = () => ({ x: 0, y: 0, z: 0 });

describe("predictImpact (practice coach)", () => {
  it("lands on the crosshair at the zero distance with no wind", () => {
    const p = predictImpact(eye, 0, 0, 2, 300, still); // zero index 2 = 300 m
    expect(p).not.toBeNull();
    expect(Math.abs(p?.rightMils ?? 99)).toBeLessThan(0.01);
    expect(Math.abs(p?.upMils ?? 99)).toBeLessThan(0.05);
  });

  it("lands low beyond the zero distance and high before it", () => {
    expect(predictImpact(eye, 0, 0, 0, 400, still)?.upMils ?? 0).toBeLessThan(-1);
    expect(predictImpact(eye, 0, 0, 3, 150, still)?.upMils ?? 0).toBeGreaterThan(0.5);
  });

  it("lands downwind: a wind blowing to the right moves the impact right", () => {
    const toRight = () => ({ x: 5, y: 0, z: 0 }); // yaw 0 looks -Z, so +X is right
    const p = predictImpact(eye, 0, 0, 2, 300, toRight);
    expect(p?.rightMils ?? 0).toBeGreaterThan(0.2);
    // 0.245 m of drift at 300 m is about 0.82 mil.
    expect(p?.rightMils ?? 0).toBeCloseTo(0.82, 1);
  });

  it("works in any view direction", () => {
    // Looking +X (yaw -PI/2): right is +Z. A wind toward +Z pushes the impact right.
    const p = predictImpact(eye, -Math.PI / 2, 0, 2, 300, () => ({ x: 0, y: 0, z: 5 }));
    expect(p?.rightMils ?? 0).toBeGreaterThan(0.2);
  });

  it("measures the crosswind component", () => {
    expect(crosswind({ x: 4, y: 0, z: 0 }, 0)).toBeCloseTo(4, 12);
    expect(crosswind({ x: 0, y: 0, z: 4 }, 0)).toBeCloseTo(0, 12);
    expect(crosswind({ x: 0, y: 0, z: 4 }, -Math.PI / 2)).toBeCloseTo(4, 12);
  });
});
