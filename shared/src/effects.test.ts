import { describe, expect, it } from "vitest";
import { IMPACT_EFFECTS, activeImpactEffect } from "./effects";

describe("rotating impact effect", () => {
  it("changes every second and cycles through all five", () => {
    const seen = [0.2, 1.2, 2.2, 3.2, 4.2, 5.2].map(activeImpactEffect);
    expect(seen).toEqual([0, 1, 2, 3, 4, 0]);
  });

  it("stays the same within one second", () => {
    expect(activeImpactEffect(2.0)).toBe(activeImpactEffect(2.99));
    expect(activeImpactEffect(2.99)).not.toBe(activeImpactEffect(3.0));
  });

  it("always returns a valid index, even for odd times", () => {
    for (const t of [-5, 0, 0.0001, 1e6 + 0.5]) {
      const i = activeImpactEffect(t);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(IMPACT_EFFECTS.count);
    }
  });
});
