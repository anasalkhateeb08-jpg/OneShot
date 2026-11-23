import * as THREE from "three/webgpu";
import { hitboxParts, isLethalZone, sampleHeight } from "@oneshot/shared";
import type { HeightGrid, HitZone, HitboxPart, PlayerZone, Posture, Vec3 } from "@oneshot/shared";

/** Practice targets (phase 1): static and moving human-size targets from 100 to 450 m. */
interface TargetDef {
  distanceM: number;
  x: number;
  posture: Posture;
  /** Walks left and right across +-amplitude at this speed (m/s). */
  moving?: { amplitudeM: number; speed: number };
}

const DEFS: readonly TargetDef[] = [
  { distanceM: 100, x: 10, posture: "stand" },
  { distanceM: 200, x: -12, posture: "stand" },
  { distanceM: 250, x: 0, posture: "stand", moving: { amplitudeM: 20, speed: 1.4 } },
  { distanceM: 300, x: 15, posture: "crouch" },
  { distanceM: 350, x: 0, posture: "stand", moving: { amplitudeM: 25, speed: 2.5 } },
  { distanceM: 400, x: -8, posture: "stand" },
  { distanceM: 450, x: 5, posture: "prone" },
];

const BODY_COLOR = 0x4d5236;
const HIT_COLOR = 0xd11f1f;
const FALL_S = 0.35;
const DOWN_S = 3;

export interface TargetHitInfo {
  id: number;
  zone: HitZone;
  lethal: boolean;
  distanceM: number;
}

interface TargetRuntime {
  def: TargetDef;
  baseZ: number;
  group: THREE.Group;
  marker: THREE.Mesh;
  /** Time the target went down (lethal hit), or null. */
  downAt: number | null;
}

/** Position along a walking path: constant speed back and forth (triangle wave). */
function walk(amplitude: number, speed: number, t: number): { offset: number; dir: number } {
  const period = (4 * amplitude) / speed;
  const phase = (t % period) / period;
  if (phase < 0.5) return { offset: -amplitude + 4 * amplitude * phase, dir: 1 };
  return { offset: 3 * amplitude - 4 * amplitude * phase, dir: -1 };
}

export class Targets {
  readonly group = new THREE.Group();
  private readonly list: TargetRuntime[] = [];
  private readonly geometry = new THREE.SphereGeometry(1, 16, 12);
  private readonly bodyMat = new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.9 });
  private readonly hitMat = new THREE.MeshBasicMaterial({ color: HIT_COLOR });

  constructor(
    private readonly grid: HeightGrid,
    shooterZone: PlayerZone,
  ) {
    for (const def of DEFS) {
      const baseZ = shooterZone.spawnZ - def.distanceM;
      const group = new THREE.Group();
      // Visual parts are the hitbox ellipsoids themselves: what you see is what you hit.
      for (const part of hitboxParts({ x: 0, y: 0, z: 0 }, 0, def.posture)) {
        const mesh = new THREE.Mesh(this.geometry, this.bodyMat);
        mesh.position.set(part.shape.center.x, part.shape.center.y, part.shape.center.z);
        mesh.scale.set(part.shape.radii.x, part.shape.radii.y, part.shape.radii.z);
        mesh.castShadow = true;
        group.add(mesh);
      }
      const marker = new THREE.Mesh(this.geometry, this.hitMat);
      marker.scale.setScalar(0.05);
      marker.visible = false;
      group.add(marker);
      this.group.add(group);
      this.list.push({ def, baseZ, group, marker, downAt: null });
    }
  }

  private feetAndYaw(t: TargetRuntime, timeS: number): { feet: Vec3; yaw: number } {
    let x = t.def.x;
    let yaw = Math.PI; // facing the shooter (+Z)
    if (t.def.moving) {
      const w = walk(t.def.moving.amplitudeM, t.def.moving.speed, timeS);
      x += w.offset;
      yaw = w.dir > 0 ? -Math.PI / 2 : Math.PI / 2; // facing the walking direction
    }
    return { feet: { x, y: sampleHeight(this.grid, x, t.baseZ), z: t.baseZ }, yaw };
  }

  /** Hitboxes of every standing target at a time (down targets cannot be hit). */
  hitboxesAt(timeS: number): Array<{ id: number; parts: HitboxPart[] }> {
    const out: Array<{ id: number; parts: HitboxPart[] }> = [];
    this.list.forEach((t, id) => {
      if (t.downAt !== null) return;
      const { feet, yaw } = this.feetAndYaw(t, timeS);
      out.push({ id, parts: hitboxParts(feet, yaw, t.def.posture) });
    });
    return out;
  }

  /** Registers a hit; returns details for the HUD. */
  hit(
    id: number,
    zone: HitZone,
    point: Vec3,
    timeS: number,
    distanceM: number,
  ): TargetHitInfo | null {
    const t = this.list[id];
    if (!t) return null;
    const lethal = isLethalZone(zone);
    const { feet, yaw } = this.feetAndYaw(t, timeS);
    // Marker in the target's local frame, so it moves with a walking target.
    const dx = point.x - feet.x;
    const dz = point.z - feet.z;
    const c = Math.cos(-yaw);
    const s = Math.sin(-yaw);
    t.marker.position.set(c * dx + s * dz, point.y - feet.y, -s * dx + c * dz);
    t.marker.visible = true;
    if (lethal) t.downAt = timeS;
    return { id, zone, lethal, distanceM };
  }

  /** Updates positions and the fall animation. */
  update(timeS: number): void {
    for (const t of this.list) {
      const { feet, yaw } = this.feetAndYaw(t, timeS);
      t.group.position.set(feet.x, feet.y, feet.z);
      t.group.rotation.set(0, yaw, 0);
      if (t.downAt !== null) {
        const since = timeS - t.downAt;
        if (since > DOWN_S) {
          t.downAt = null;
          t.marker.visible = false;
        } else {
          const f = Math.min(1, since / FALL_S);
          t.group.rotation.set(-f * (Math.PI / 2) * 0.95, yaw, 0, "YXZ");
        }
      }
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.bodyMat.dispose();
    this.hitMat.dispose();
  }
}
