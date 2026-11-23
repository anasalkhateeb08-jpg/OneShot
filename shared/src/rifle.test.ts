import { describe, expect, it } from "vitest";
import { RIFLE } from "./constants";
import { canFire, fireRifle, initialRifle, startReload, stepRifle } from "./rifle";
import type { RifleState } from "./rifle";

function run(s: RifleState, seconds: number): RifleState {
  let r = s;
  for (let i = 0; i < Math.round(seconds * 60); i++) r = stepRifle(r, 1 / 60);
  return r;
}

describe("rifle", () => {
  it("starts with a full magazine, ready to fire", () => {
    const r = initialRifle();
    expect(r.rounds).toBe(RIFLE.magazine);
    expect(canFire(r)).toBe(true);
  });

  it("cannot fire again until the bolt has cycled", () => {
    const fired = fireRifle(initialRifle());
    expect(fired.rounds).toBe(RIFLE.magazine - 1);
    expect(canFire(fired)).toBe(false);
    expect(canFire(run(fired, RIFLE.boltCycleS - 0.1))).toBe(false);
    expect(canFire(run(fired, RIFLE.boltCycleS + 0.05))).toBe(true);
  });

  it("ignores a fire attempt that is not allowed", () => {
    const fired = fireRifle(initialRifle());
    expect(fireRifle(fired)).toEqual(fired);
  });

  it("runs dry after a full magazine", () => {
    let r = initialRifle();
    for (let i = 0; i < RIFLE.magazine; i++) {
      r = run(fireRifle(r), RIFLE.boltCycleS + 0.05);
    }
    expect(r.rounds).toBe(0);
    expect(canFire(r)).toBe(false);
  });

  it("reloads to a full magazine after the reload time, and cannot fire meanwhile", () => {
    const empty: RifleState = { rounds: 0, boltS: 0, reloadS: 0 };
    const reloading = startReload(empty);
    expect(reloading.reloadS).toBe(RIFLE.reloadS);
    expect(canFire(run(reloading, RIFLE.reloadS - 0.1))).toBe(false);
    const done = run(reloading, RIFLE.reloadS + 0.05);
    expect(done.rounds).toBe(RIFLE.magazine);
    expect(canFire(done)).toBe(true);
  });

  it("does not reload a full magazine", () => {
    expect(startReload(initialRifle())).toEqual(initialRifle());
  });
});
