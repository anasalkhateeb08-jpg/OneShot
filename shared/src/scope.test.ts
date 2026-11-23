import { describe, expect, it } from "vitest";
import { SCOPE } from "./constants";
import { DESERT_CANYON } from "./mapDesert";
import { fovForZoom, lensViewWidth, scopeZoomRange, zoneDistance } from "./scope";

describe("scope zoom range (owner rule: lowest zoom shows the whole enemy zone, no more)", () => {
  const range = scopeZoomRange(DESERT_CANYON);
  const zoneWidth = 2 * DESERT_CANYON.zones[1].halfWidth;
  const d = zoneDistance(DESERT_CANYON);

  it("at the lowest zoom the lens shows exactly the enemy zone's width", () => {
    const seen = lensViewWidth(fovForZoom(range.min), d);
    expect(seen).toBeCloseTo(zoneWidth * SCOPE.maxViewOfEnemyZone, 6);
  });

  it("never shows more than the enemy zone at any zoom level", () => {
    for (const z of range.levels) {
      expect(lensViewWidth(fovForZoom(z), d)).toBeLessThanOrEqual(zoneWidth + 1e-9);
    }
  });

  it("has increasing levels from min to max", () => {
    expect(range.levels).toHaveLength(SCOPE.zoomLevels);
    expect(range.levels[0]).toBeCloseTo(range.min, 9);
    expect(range.levels.at(-1)).toBeCloseTo(range.max, 9);
    for (let i = 1; i < range.levels.length; i++) {
      expect(range.levels[i] ?? 0).toBeGreaterThan(range.levels[i - 1] ?? 0);
    }
    expect(range.max / range.min).toBeCloseTo(SCOPE.maxOverMinZoom, 9);
  });

  it("gives about 8.6x to 30x on the desert map (400 m between zones, 60 m zones)", () => {
    expect(d).toBeCloseTo(400, 6);
    expect(range.min).toBeGreaterThan(8.3);
    expect(range.min).toBeLessThan(8.9);
    expect(range.max).toBeGreaterThan(29);
    expect(range.max).toBeLessThan(31);
  });
});
