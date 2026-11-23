import { describe, expect, it } from "vitest";
import { fbm2, smoothstep, valueNoise2 } from "./noise";

describe("noise", () => {
  it("is deterministic and stays in range", () => {
    for (let i = 0; i < 500; i++) {
      const x = i * 0.37 - 50;
      const z = i * 0.91 - 120;
      const v = valueNoise2(x, z, 9);
      expect(v).toBe(valueNoise2(x, z, 9));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const f = fbm2(x, z, 9);
      expect(f).toBeGreaterThanOrEqual(-1);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it("is continuous (small step, small change)", () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.53;
      expect(Math.abs(fbm2(x + 0.001, 3, 4) - fbm2(x, 3, 4))).toBeLessThan(0.02);
    }
  });

  it("depends on the seed", () => {
    expect(valueNoise2(1.5, 2.5, 1)).not.toBe(valueNoise2(1.5, 2.5, 2));
  });

  it("has a correct smoothstep", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
  });
});
