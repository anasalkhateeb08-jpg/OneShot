import { describe, expect, it } from "vitest";
import { hitboxParts, isLethalZone, segmentHitbox } from "./hitbox";

const feet = { x: 0, y: 0, z: -100 };

/** A horizontal shot along -Z at a given height and sideways offset. */
function shoot(y: number, x = 0) {
  return { a: { x, y, z: 0 }, b: { x, y, z: -200 } };
}

describe("hitbox", () => {
  const standing = hitboxParts(feet, Math.PI, "stand"); // facing the shooter (+Z)

  it("finds head, torso, and legs at the right heights (standing)", () => {
    const head = shoot(1.62);
    const torso = shoot(1.2);
    const legs = shoot(0.5, 0.1);
    expect(segmentHitbox(head.a, head.b, standing)?.zone).toBe("head");
    expect(segmentHitbox(torso.a, torso.b, standing)?.zone).toBe("torso");
    expect(segmentHitbox(legs.a, legs.b, standing)?.zone).toBe("limb");
  });

  it("misses above the head and beside the body", () => {
    const over = shoot(1.9);
    const beside = shoot(1.2, 0.6);
    expect(segmentHitbox(over.a, over.b, standing)).toBeNull();
    expect(segmentHitbox(beside.a, beside.b, standing)).toBeNull();
  });

  it("is lower and smaller crouched and prone", () => {
    const shot = shoot(1.2);
    expect(segmentHitbox(shot.a, shot.b, hitboxParts(feet, Math.PI, "crouch"))).toBeNull();
    const low = shoot(0.2);
    expect(segmentHitbox(low.a, low.b, hitboxParts(feet, Math.PI, "prone"))).not.toBeNull();
    const mid = shoot(0.8);
    expect(segmentHitbox(mid.a, mid.b, hitboxParts(feet, Math.PI, "prone"))).toBeNull();
  });

  it("lays a prone body along its facing direction", () => {
    // Prone facing -X: the body is long along X, so a shot along X hits it end-on and a
    // shot along Z one meter behind the feet still hits the legs.
    const parts = hitboxParts(feet, Math.PI / 2, "prone");
    const legs = { a: { x: 0.8, y: 0.12, z: 0 }, b: { x: 0.8, y: 0.12, z: -200 } };
    expect(segmentHitbox(legs.a, legs.b, parts)?.zone).toBe("limb");
  });

  it("treats head and torso as lethal, limbs as wounds", () => {
    expect(isLethalZone("head")).toBe(true);
    expect(isLethalZone("torso")).toBe(true);
    expect(isLethalZone("limb")).toBe(false);
  });
});
