import { describe, expect, it } from "vitest";
import { initialBreath, stepBreath } from "./breath";
import type { BreathState } from "./breath";
import { PLAYER } from "./constants";

const DT = 1 / 60;

function run(state: BreathState, hold: boolean, seconds: number): BreathState {
  let s = state;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) s = stepBreath(s, hold, DT);
  return s;
}

describe("breath", () => {
  it("starts full and calm", () => {
    const s = initialBreath();
    expect(s.lung).toBe(1);
    expect(s.mode).toBe("normal");
    expect(s.swayScale).toBe(1);
  });

  it("holding steadies the scope smoothly, not in a jump", () => {
    const first = stepBreath(initialBreath(), true, DT);
    expect(first.mode).toBe("holding");
    expect(first.swayScale).toBeLessThan(1);
    expect(first.swayScale).toBeGreaterThan(0.9);
    const later = run(initialBreath(), true, 1.5);
    expect(later.swayScale).toBeCloseTo(PLAYER.breathHoldSwayFactor, 2);
    expect(later.breathingWeight).toBeLessThan(0.01);
  });

  it("empties the lungs after 1 / drain seconds and forces an exhale", () => {
    const holdSeconds = 1 / PLAYER.lungDrainPerS;
    const before = run(initialBreath(), true, holdSeconds - 0.1);
    expect(before.mode).toBe("holding");
    const after = run(initialBreath(), true, holdSeconds + 0.1);
    expect(after.mode).toBe("exhausted");
    expect(after.lung).toBeLessThan(0.05);
  });

  it("gives heavy sway during the forced exhale, then returns to normal", () => {
    const exhausted = run(initialBreath(), true, 1 / PLAYER.lungDrainPerS + 0.05);
    const mid = run(exhausted, false, 1.5);
    expect(mid.mode).toBe("exhausted");
    expect(mid.swayScale).toBeGreaterThan(2);
    const done = run(exhausted, false, PLAYER.forcedExhaleSwayS + 0.1);
    expect(done.mode).toBe("normal");
  });

  it("blocks a new hold until the key is released", () => {
    const exhausted = run(initialBreath(), true, 1 / PLAYER.lungDrainPerS + 0.05);
    const stillHeld = run(exhausted, true, PLAYER.forcedExhaleSwayS + 1);
    expect(stillHeld.mode).toBe("normal");
    const released = stepBreath(stillHeld, false, DT);
    const pressedAgain = stepBreath(released, true, DT);
    expect(pressedAgain.mode).toBe("holding");
  });

  it("recovers the lungs gradually when breathing", () => {
    const half = run(initialBreath(), true, 0.5 / PLAYER.lungDrainPerS);
    expect(half.lung).toBeCloseTo(0.5, 1);
    const rested = run(half, false, 0.5 / PLAYER.lungRecoverPerS + 0.1);
    expect(rested.lung).toBe(1);
  });
});
