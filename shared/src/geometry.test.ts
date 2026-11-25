import { describe, expect, it } from "vitest";
import {
  createRng,
  directionFromYawPitch,
  segmentAabb,
  segmentEllipsoid,
  segmentOrientedBox,
  segmentSphere,
  toBoxLocal,
  toRotatedLocal,
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

describe("segmentEllipsoid", () => {
  const rock = { center: { x: 0, y: 1, z: -10 }, radiusXZ: 3, radiusY: 1 };

  it("hits a wide, flat rock where a sphere of its height would miss", () => {
    const t = segmentEllipsoid({ x: 2.5, y: 1, z: 0 }, { x: 2.5, y: 1, z: -20 }, rock);
    expect(t).not.toBeNull();
  });

  it("misses just above the rock's top", () => {
    expect(segmentEllipsoid({ x: 0, y: 2.05, z: 0 }, { x: 0, y: 2.05, z: -20 }, rock)).toBeNull();
  });

  it("finds the entry point on the front face", () => {
    const t = segmentEllipsoid({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -20 }, rock);
    expect(t).toBeCloseTo(7 / 20, 12);
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

  it("hits a rotated box only where the rotated box is (segmentOrientedBox)", () => {
    const box = { center: { x: 0, y: 1, z: 0 }, half: { x: 2, y: 1, z: 0.5 }, rotY: Math.PI / 2 };
    // Rotated a quarter turn: long side along Z (z from -2 to 2). A shot along X at z=2.5
    // misses, a shot along X at z=1.5 hits, and a shot along Z hits the near end.
    expect(segmentOrientedBox({ x: -5, y: 1, z: 2.5 }, { x: 5, y: 1, z: 2.5 }, box)).toBeNull();
    expect(segmentOrientedBox({ x: -5, y: 1, z: 1.5 }, { x: 5, y: 1, z: 1.5 }, box)).not.toBeNull();
    const t = segmentOrientedBox({ x: 0, y: 1, z: -5 }, { x: 0, y: 1, z: 5 }, box);
    expect(t).not.toBeNull();
    expect((t ?? 0) * 10).toBeCloseTo(3, 6);
  });
});

describe("toRotatedLocal (D-051)", () => {
  it("matches toBoxLocal when there is no tilt", () => {
    const a = toRotatedLocal(0, 0.7, 0, { x: 1.5, y: 2, z: -0.4 });
    const b = toBoxLocal(0.7, 1.5, -0.4);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(2);
    expect(a.z).toBeCloseTo(b.z);
  });

  it("undoes a tilt: world up is the rock's own -Z after a quarter turn around X", () => {
    const l = toRotatedLocal(Math.PI / 2, 0, 0, { x: 0, y: 1, z: 0 });
    expect(l.x).toBeCloseTo(0);
    expect(l.y).toBeCloseTo(0);
    expect(l.z).toBeCloseTo(-1);
  });
});
