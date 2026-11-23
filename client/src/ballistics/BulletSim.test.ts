import { describe, expect, it } from "vitest";
import { BALLISTICS, CRATE, buildHeightGrid } from "@oneshot/shared";
import type { CrateProp, WorldColliders } from "@oneshot/shared";
import { BulletSim } from "./BulletSim";

const grid = buildHeightGrid({ minX: -50, maxX: 50, minZ: -300, maxZ: 50, step: 4 }, () => 0);

function crateAt(z: number): CrateProp {
  return {
    box: { center: { x: 0, y: 1.5, z }, half: { x: 0.5, y: 0.5, z: 0.5 }, rotY: 0 },
    lean: 0,
    variant: 0,
  };
}

function world(crates: CrateProp[]): WorldColliders {
  return { grid, walls: [], rocks: [], crates };
}

function run(sim: BulletSim, seconds: number) {
  const impacts: ReturnType<BulletSim["step"]> = [];
  let t = 0;
  while (t < seconds) {
    impacts.push(...sim.step(1 / 60, t));
    t += 1 / 60;
  }
  return impacts;
}

describe("bullet and crates (D-032)", () => {
  it("passes through a crate, slowed, and leaves one crate impact", () => {
    const sim = new BulletSim(world([crateAt(-50)]), () => [], 1);
    sim.fire({ pos: { x: 0, y: 1.5, z: 0 }, vel: { x: 0, y: 0, z: -BALLISTICS.muzzleSpeed } });
    const impacts = run(sim, 0.2);
    expect(impacts.filter((i) => i.kind === "crate")).toHaveLength(1);
    const bullet = sim.bullets[0];
    expect(bullet !== undefined).toBe(true);
    const speed = Math.hypot(
      bullet?.state.vel.x ?? 0,
      bullet?.state.vel.y ?? 0,
      bullet?.state.vel.z ?? 0,
    );
    expect(speed).toBeLessThan(BALLISTICS.muzzleSpeed * CRATE.speedKeep + 1);
    expect(speed).toBeGreaterThan(BALLISTICS.muzzleSpeed * CRATE.speedKeep * 0.6);
  });

  it("slows only once per crate even though the bullet is inside it for many substeps", () => {
    // A deep crate (40 m) keeps a 300 m/s bullet inside for about 30 substeps.
    const deep: CrateProp = {
      box: { center: { x: 0, y: 1.5, z: -50 }, half: { x: 0.5, y: 0.5, z: 20 }, rotY: 0 },
      lean: 0,
      variant: 0,
    };
    const sim = new BulletSim(world([deep]), () => [], 1);
    sim.fire({ pos: { x: 0, y: 1.5, z: 0 }, vel: { x: 0, y: 0, z: -300 } });
    const impacts = run(sim, 0.5);
    expect(impacts.filter((i) => i.kind === "crate")).toHaveLength(1);
    const bullet = sim.bullets[0];
    expect(bullet !== undefined).toBe(true);
    const v = bullet?.state.vel;
    const speed = Math.hypot(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0);
    expect(speed).toBeLessThan(300 * CRATE.speedKeep);
    expect(speed).toBeGreaterThan(300 * CRATE.speedKeep * 0.8);
  });

  it("two crates in a row slow it twice", () => {
    const sim = new BulletSim(world([crateAt(-40), crateAt(-60)]), () => [], 1);
    sim.fire({ pos: { x: 0, y: 1.5, z: 0 }, vel: { x: 0, y: 0, z: -BALLISTICS.muzzleSpeed } });
    const impacts = run(sim, 0.3);
    expect(impacts.filter((i) => i.kind === "crate")).toHaveLength(2);
  });

  it("reports which crate was crossed and where the bullet leaves it (for the holes)", () => {
    const sim = new BulletSim(world([crateAt(-50)]), () => [], 1);
    sim.fire({ pos: { x: 0, y: 1.5, z: 0 }, vel: { x: 0, y: 0, z: -BALLISTICS.muzzleSpeed } });
    const hit = run(sim, 0.2).find((i) => i.kind === "crate");
    expect(hit?.crateIndex).toBe(0);
    expect(hit?.point.z).toBeCloseTo(-49.5, 1);
    expect(hit?.exitPoint?.z).toBeCloseTo(-50.5, 1);
  });
});
