import { describe, expect, it } from "vitest";
import { MSG } from "./messages";
import type { ClientInput, JoinOptions } from "./messages";

describe("messages", () => {
  it("uses message names equal to their keys", () => {
    for (const [key, value] of Object.entries(MSG)) {
      expect(value).toBe(key);
    }
  });

  it("has unique message names", () => {
    const values = Object.values(MSG);
    expect(new Set(values).size).toBe(values.length);
  });

  it("accepts a well-formed ClientInput and JoinOptions", () => {
    const input = {
      seq: 1,
      dt: 1 / 30,
      moveX: 0,
      moveZ: 1,
      yaw: 0.5,
      pitch: -0.1,
      posture: "prone",
      scoped: true,
      holdBreath: false,
      zeroIndex: 2,
    } satisfies ClientInput;

    const join = {
      timerPreset: 300,
      inputClass: "mouseKeyboard",
      protocolVersion: 1,
      clientBuild: "dev",
      shellVersionCode: null,
      locale: "ar",
    } satisfies JoinOptions;

    expect(input.zeroIndex).toBe(2);
    expect(join.timerPreset).toBe(300);
  });
});
