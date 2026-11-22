import { describe, expect, it } from "vitest";
import {
  ABUSE,
  BALLISTICS,
  EXPOSURE,
  KILLCAM,
  LANGUAGES,
  MATCH,
  NET,
  PLAYER,
  RIFLE,
  SIM,
  TEXT_EXPANSION_BUDGET,
  TOUCH,
  TRIALS,
  VERSIONING,
  WIND,
} from "./constants";

/** Collects every number inside a nested constant object. */
function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, out);
  }
  return out;
}

describe("constants", () => {
  it("contains only finite, positive numbers", () => {
    const groups = [
      SIM,
      BALLISTICS,
      WIND,
      RIFLE,
      PLAYER,
      NET,
      KILLCAM,
      MATCH,
      EXPOSURE,
      TRIALS,
      ABUSE,
      TOUCH,
      VERSIONING,
    ];
    const numbers = collectNumbers(groups);
    expect(numbers.length).toBeGreaterThan(50);
    for (const n of numbers) {
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    }
    expect(TEXT_EXPANSION_BUDGET).toBeGreaterThan(1);
  });

  it("uses a bullet substep that is a whole multiple of the physics rate", () => {
    expect(SIM.bulletSubstepHz % SIM.physicsHz).toBe(0);
    expect(SIM.physicsHz % SIM.serverTickHz).toBe(0);
  });

  it("has four strictly increasing zeroing distances (zeroIndex 0..3)", () => {
    expect(RIFLE.zeroing).toHaveLength(4);
    for (let i = 1; i < RIFLE.zeroing.length; i++) {
      const prev = RIFLE.zeroing[i - 1] ?? Number.POSITIVE_INFINITY;
      const cur = RIFLE.zeroing[i] ?? 0;
      expect(cur).toBeGreaterThan(prev);
    }
  });

  it("orders posture values so prone is the steadiest and lowest", () => {
    const s = PLAYER.swayMultiplier;
    expect(s.prone).toBeLessThan(s.crouch);
    expect(s.crouch).toBeLessThan(s.stand);
    const h = PLAYER.eyeHeight;
    expect(h.prone).toBeLessThan(h.crouch);
    expect(h.crouch).toBeLessThan(h.stand);
  });

  it("keeps breath-hold factors as reductions", () => {
    expect(PLAYER.breathHoldSwayFactor).toBeLessThan(1);
    expect(PLAYER.breathHoldFovFactor).toBeLessThan(1);
    expect(PLAYER.forcedExhaleSwayFactor).toBeGreaterThan(1);
  });

  it("offers exactly the three real-duel timer presets", () => {
    expect([...MATCH.timerPresets]).toEqual([180, 300, 600]);
    expect(MATCH.pulseSectorMinDeg).toBeLessThanOrEqual(MATCH.pulseSectorStartDeg);
    expect(MATCH.suddenDeathBeforeEndS).toBeLessThan(Math.min(...MATCH.timerPresets));
  });

  it("keeps the wind period range valid", () => {
    expect(WIND.minPeriodS).toBeLessThan(WIND.maxPeriodS);
  });

  it("keeps the trial rules consistent", () => {
    expect(TRIALS.startFree).toBeLessThanOrEqual(TRIALS.freeCap);
    expect(ABUSE.minMatchSecondsForReward).toBeLessThan(Math.min(...MATCH.timerPresets));
  });

  it("keeps touch sizes at or above the minimum target", () => {
    expect(TOUCH.fireButtonPx).toBeGreaterThanOrEqual(TOUCH.minTargetPx);
    expect(TOUCH.secondaryButtonPx).toBeGreaterThanOrEqual(TOUCH.minTargetPx);
    expect(TOUCH.layoutScaleMin).toBeLessThan(TOUCH.layoutScaleMax);
  });

  it("lists 15 unique languages with English and Arabic", () => {
    expect(LANGUAGES).toHaveLength(15);
    expect(new Set(LANGUAGES).size).toBe(15);
    expect(LANGUAGES).toContain("en");
    expect(LANGUAGES).toContain("ar");
  });

  it("caps rewind below the interpolation history", () => {
    const historyMs = (NET.historyFrames / SIM.serverTickHz) * 1000;
    expect(NET.maxRewindMs).toBeLessThanOrEqual(historyMs);
  });
});
