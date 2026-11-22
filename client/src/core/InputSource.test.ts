import { describe, expect, it } from "vitest";
import { IdleInputSource } from "./InputSource";
import type { InputSource } from "./InputSource";

describe("IdleInputSource", () => {
  it("implements InputSource with a neutral input and rising sequence numbers", () => {
    const source: InputSource = new IdleInputSource();
    const a = source.poll(1 / 60);
    const b = source.poll(1 / 60);

    expect(source.kind).toBe("mouseKeyboard");
    expect(b.seq).toBe(a.seq + 1);
    expect(a.dt).toBeCloseTo(1 / 60, 10);
    expect(a.moveX).toBe(0);
    expect(a.moveZ).toBe(0);
    expect(a.posture).toBe("stand");
    expect(a.scoped).toBe(false);
    expect(a.holdBreath).toBe(false);
    expect(a.zeroIndex).toBe(0);
    expect(() => source.dispose()).not.toThrow();
  });
});
