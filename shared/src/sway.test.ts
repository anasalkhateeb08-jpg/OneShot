import { describe, expect, it } from "vitest";
import { initialBreath } from "./breath";
import type { BreathState } from "./breath";
import { swayAmplitudes, swayOffset } from "./sway";
import type { SwayAmplitudes } from "./sway";

function rms(seed: number, amps: SwayAmplitudes): number {
  let sum = 0;
  let n = 0;
  for (let t = 0; t < 60; t += 0.05) {
    const o = swayOffset(t, seed, amps);
    sum += o.yaw * o.yaw + o.pitch * o.pitch;
    n++;
  }
  return Math.sqrt(sum / n);
}

const holding: BreathState = {
  ...initialBreath(),
  mode: "holding",
  swayScale: 0.15,
  breathingWeight: 0,
};

describe("sway", () => {
  it("is deterministic and depends on the player seed", () => {
    const amps = swayAmplitudes("stand", initialBreath(), false);
    expect(swayOffset(3.2, 77, amps)).toEqual(swayOffset(3.2, 77, amps));
    expect(swayOffset(3.2, 77, amps)).not.toEqual(swayOffset(3.2, 78, amps));
  });

  it("stays within its amplitude", () => {
    const amps = swayAmplitudes("stand", initialBreath(), false);
    for (let t = 0; t < 30; t += 0.03) {
      const o = swayOffset(t, 5, amps);
      expect(Math.abs(o.yaw)).toBeLessThanOrEqual(amps.amplitudeRad + 1e-12);
      expect(Math.abs(o.pitch)).toBeLessThanOrEqual(amps.amplitudeRad + amps.breathingRad + 1e-12);
    }
  });

  it("is smallest prone and largest standing", () => {
    const b = initialBreath();
    const stand = rms(9, swayAmplitudes("stand", b, false));
    const crouch = rms(9, swayAmplitudes("crouch", b, false));
    const prone = rms(9, swayAmplitudes("prone", b, false));
    expect(prone).toBeLessThan(crouch);
    expect(crouch).toBeLessThan(stand);
  });

  it("is greatly reduced by holding the breath", () => {
    const normal = rms(3, swayAmplitudes("prone", initialBreath(), false));
    const held = rms(3, swayAmplitudes("prone", holding, false));
    expect(held).toBeLessThan(normal * 0.25);
  });

  it("grows by 50% with a limb wound", () => {
    const b = initialBreath();
    const healthy = swayAmplitudes("crouch", b, false);
    const wounded = swayAmplitudes("crouch", b, true);
    expect(wounded.amplitudeRad).toBeCloseTo(healthy.amplitudeRad * 1.5, 12);
  });

  it("is zero when the amplitudes are zero", () => {
    // Math.abs: the result may be -0, which equals 0 but fails a strict deep-equal.
    const o = swayOffset(12, 4, { amplitudeRad: 0, breathingRad: 0 });
    expect(Math.abs(o.yaw)).toBe(0);
    expect(Math.abs(o.pitch)).toBe(0);
  });
});
