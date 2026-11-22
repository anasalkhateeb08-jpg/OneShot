import { describe, expect, it } from "vitest";
import { WIND } from "./constants";
import { length, sub } from "./geometry";
import { windAt, windSpeedAndDirection } from "./wind";

describe("wind", () => {
  it("is deterministic for the same time and seed", () => {
    expect(windAt(42.5, 1234)).toEqual(windAt(42.5, 1234));
  });

  it("differs between match seeds", () => {
    const a = windAt(10, 1);
    const b = windAt(10, 2);
    expect(a.x !== b.x || a.z !== b.z).toBe(true);
  });

  it("is horizontal and never exceeds the maximum speed", () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (let t = 0; t <= 600; t += 7.3) {
        const w = windAt(t, seed);
        expect(w.y).toBe(0);
        expect(length(w)).toBeLessThanOrEqual(WIND.maxSpeed + 1e-9);
        const { speed } = windSpeedAndDirection(t, seed);
        expect(speed).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("changes slowly (no gusts that jump between frames)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (let t = 0; t < 300; t += 1.7) {
        const change = length(sub(windAt(t + 0.1, seed), windAt(t, seed)));
        expect(change).toBeLessThan(0.25);
      }
    }
  });
});
