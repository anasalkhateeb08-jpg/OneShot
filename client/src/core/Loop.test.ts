import { describe, expect, it } from "vitest";
import { FixedStepLoop } from "./Loop";

function makeLoop(hz = 60) {
  const updates: number[] = [];
  const renders: Array<{ alpha: number; frameSeconds: number }> = [];
  const loop = new FixedStepLoop(
    {
      update: (dt) => updates.push(dt),
      render: (alpha, frameSeconds) => renders.push({ alpha, frameSeconds }),
    },
    hz,
  );
  return { loop, updates, renders };
}

describe("FixedStepLoop", () => {
  it("renders on the first tick without updating", () => {
    const { loop, updates, renders } = makeLoop();
    expect(loop.tick(1000)).toBe(0);
    expect(updates).toHaveLength(0);
    expect(renders).toEqual([{ alpha: 0, frameSeconds: 0 }]);
  });

  it("runs exactly 60 fixed steps for one simulated second at 60 Hz", () => {
    const { loop, updates } = makeLoop(60);
    loop.tick(0);
    let total = 0;
    for (let i = 1; i <= 4; i++) total += loop.tick(i * 250);
    expect(total).toBe(60);
    expect(updates).toHaveLength(60);
    for (const dt of updates) expect(dt).toBeCloseTo(1 / 60, 12);
  });

  it("produces an interpolation alpha between steps", () => {
    const { loop, renders } = makeLoop(60);
    loop.tick(0);
    const steps = loop.tick(25); // 25 ms = 1.5 steps
    expect(steps).toBe(1);
    const last = renders.at(-1);
    expect(last?.alpha).toBeCloseTo(0.5, 6);
    expect(last?.alpha).toBeGreaterThanOrEqual(0);
    expect(last?.alpha).toBeLessThan(1);
  });

  it("clamps a very long frame so it cannot spiral", () => {
    const { loop } = makeLoop(60);
    loop.tick(0);
    expect(loop.tick(5000)).toBe(15); // clamped to 0.25 s
  });

  it("ignores time going backwards", () => {
    const { loop } = makeLoop(60);
    loop.tick(1000);
    expect(loop.tick(500)).toBe(0);
  });

  it("rejects an invalid rate", () => {
    const noop = { update: () => undefined, render: () => undefined };
    expect(() => new FixedStepLoop(noop, 0)).toThrow();
    expect(() => new FixedStepLoop(noop, Number.NaN)).toThrow();
  });
});
