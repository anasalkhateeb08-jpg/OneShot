import { describe, expect, it } from "vitest";
import {
  createRng,
  directionFromYawPitch,
  segmentAabb,
  segmentSphere,
  wrapAngle,
  yawPitchFromDirection,
} from "./geometry";

describe("view direction", () => {
  it("looks toward -Z at yaw 0, pitch 0", () => {
    const d = directionFromYawPitch(0, 0);
    expect(d.x).toBeCloseTo(0, 12);
    expect(d.y).toBeCloseTo(0, 12);
    expect(d.z).toBeCloseTo(-1, 12);
  });

  it("turns left (toward -X) with positive yaw and up with positive pitch", () => {
    expect(directionFromYawPitch(Math.PI / 2, 0).x).toBeCloseTo(-1, 12);
    expect(directionFromYawPitch(0, 0.3).y).toBeGreaterThan(0);
  });

  it("round-trips yaw and pitch", () => {
    const back = yawPitchFromDirection(directionFromYawPitch(1.1, -0.2));
    expect(back.yaw).toBeCloseTo(1.1, 12);
    expect(back.pitch).toBeCloseTo(-0.2, 12);
  });

  it("wraps angles into (-PI, PI]", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2, 12);
  });
});

describe("segment tests (a path SEGMENT, never just a point)", () => {
  const box = { min: { x: -1, y: 0, z: -11 }, max: { x: 1, y: 2, z: -10 } };

  it("finds the entry point of a segment through a box", () => {
    const t = segmentAabb({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -20 }, box);
    expect(t).toBeCloseTo(0.5, 12);
  });

  it("catches a fast segment that jumps completely over a thin wall", () => {
    // Both end points are outside the wall; only a segment test sees the hit.
    const t = segmentAabb({ x: 0, y: 1, z: -9 }, { x: 0, y: 1, z: -12 }, box);
    expect(t).not.toBeNull();
  });

  it("misses a box beside the path, and a box beyond the segment", () => {
    expect(segmentAabb({ x: 3, y: 1, z: 0 }, { x: 3, y: 1, z: -20 }, box)).toBeNull();
    expect(segmentAabb({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -5 }, box)).toBeNull();
  });

  it("hits and misses spheres correctly", () => {
    const s = { center: { x: 0, y: 0, z: -10 }, radius: 1 };
    expect(segmentSphere({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -20 }, s)).toBeCloseTo(0.45, 12);
    expect(segmentSphere({ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: -20 }, s)).toBeNull();
    expect(segmentSphere({ x: 0, y: 0, z: -10 }, { x: 0, y: 0, z: -20 }, s)).toBe(0);
  });
});

describe("createRng", () => {
  it("is deterministic and stays in [0, 1)", () => {
    const a = createRng(99);
    const b = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
