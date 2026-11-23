import { describe, expect, it } from "vitest";
import { AdaptiveQuality, QUALITY_PRESETS } from "./Quality";
import type { QualityLevel } from "./Quality";

function feed(q: AdaptiveQuality, fps: number, seconds: number): void {
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) q.sample(dt);
}

describe("AdaptiveQuality", () => {
  it("applies the initial level immediately", () => {
    const applied: QualityLevel[] = [];
    new AdaptiveQuality("medium", (l) => applied.push(l));
    expect(applied).toEqual(["medium"]);
  });

  it("steps down after sustained low frame rates", () => {
    const applied: QualityLevel[] = [];
    const q = new AdaptiveQuality("high", (l) => applied.push(l));
    feed(q, 30, 4.5);
    expect(q.level).toBe("medium");
    feed(q, 30, 4.5);
    expect(q.level).toBe("low");
    feed(q, 30, 10);
    expect(q.level).toBe("low");
  });

  it("does not react to one short dip", () => {
    const q = new AdaptiveQuality("high", () => undefined);
    feed(q, 30, 2.1);
    feed(q, 60, 2.1);
    expect(q.level).toBe("high");
  });

  it("steps up after sustained high frame rates", () => {
    const q = new AdaptiveQuality("low", () => undefined);
    feed(q, 60, 6.5);
    expect(q.level).toBe("medium");
  });

  it("stops adapting after a manual choice", () => {
    const q = new AdaptiveQuality("high", () => undefined);
    q.set("high");
    feed(q, 20, 10);
    expect(q.level).toBe("high");
    expect(q.auto).toBe(false);
  });

  it("cycles through the levels", () => {
    const q = new AdaptiveQuality("low", () => undefined);
    q.cycle();
    expect(q.level).toBe("medium");
    q.cycle();
    q.cycle();
    expect(q.level).toBe("low");
  });

  it("keeps low cheaper than medium", () => {
    expect(QUALITY_PRESETS.low.resolutionScale).toBeLessThan(
      QUALITY_PRESETS.medium.resolutionScale,
    );
    expect(QUALITY_PRESETS.low.shadows).toBe(false);
  });
});
