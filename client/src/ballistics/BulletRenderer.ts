import * as THREE from "three/webgpu";
import type { FlyingBullet, ImpactKind } from "./BulletSim";
import type { Vec3 } from "@oneshot/shared";

const TRACER_LENGTH_M = 7;
const TRACER_MIN_WIDTH_M = 0.015;
/** Width grows with distance so the bullet stays visible far away (about 1.5 px). */
const TRACER_WIDTH_PER_M = 0.0011;
const HIDE_NEAR_M = 4;
const PUFF_LIFE_S = 0.7;
const PUFF_SIZE_M = 1.4;

const PUFF_COLORS: Record<ImpactKind, number> = {
  terrain: 0xd9bf94,
  rock: 0x9a8a78,
  wall: 0xb8a58a,
  body: 0x8a1010,
};

interface Puff {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  bornS: number;
}

/**
 * Draws flying bullets as glowing streaks along their velocity, and impact puffs (dust, rock
 * chips, or blood). Presentation only: never affects the simulation.
 */
export class BulletRenderer {
  readonly group = new THREE.Group();
  private readonly tracerGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  private readonly tracerMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xfff2c8).multiplyScalar(3),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  private readonly puffGeometry = new THREE.SphereGeometry(1, 12, 8);
  private readonly tracers = new Map<number, THREE.Mesh>();
  private readonly puffs: Puff[] = [];
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly dir = new THREE.Vector3();

  update(bullets: readonly FlyingBullet[], camera: THREE.Camera, timeS: number): void {
    const alive = new Set<number>();
    for (const b of bullets) {
      alive.add(b.id);
      let mesh = this.tracers.get(b.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.tracerGeometry, this.tracerMaterial);
        mesh.frustumCulled = false;
        this.tracers.set(b.id, mesh);
        this.group.add(mesh);
      }
      const p = b.state.pos;
      const v = b.state.vel;
      const fromOrigin = Math.hypot(p.x - b.origin.x, p.y - b.origin.y, p.z - b.origin.z);
      mesh.visible = fromOrigin > HIDE_NEAR_M;
      this.dir.set(v.x, v.y, v.z).normalize();
      // Center the streak just behind the bullet tip.
      mesh.position.set(p.x, p.y, p.z).addScaledVector(this.dir, -TRACER_LENGTH_M / 2);
      mesh.quaternion.setFromUnitVectors(this.up, this.dir);
      const toCam = mesh.position.distanceTo(camera.position);
      const width = Math.max(TRACER_MIN_WIDTH_M, toCam * TRACER_WIDTH_PER_M);
      mesh.scale.set(width, TRACER_LENGTH_M, width);
    }
    for (const [id, mesh] of this.tracers) {
      if (!alive.has(id)) {
        this.group.remove(mesh);
        this.tracers.delete(id);
      }
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      if (!puff) continue;
      const f = (timeS - puff.bornS) / PUFF_LIFE_S;
      if (f >= 1) {
        this.group.remove(puff.mesh);
        puff.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      puff.mesh.scale.setScalar(PUFF_SIZE_M * (0.25 + 0.75 * Math.sqrt(f)));
      puff.material.opacity = 0.75 * (1 - f);
    }
  }

  impact(kind: ImpactKind, point: Vec3, timeS: number): void {
    const material = new THREE.MeshBasicMaterial({
      color: PUFF_COLORS[kind],
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.puffGeometry, material);
    mesh.position.set(point.x, point.y, point.z);
    mesh.scale.setScalar(0.1);
    this.group.add(mesh);
    this.puffs.push({ mesh, material, bornS: timeS });
  }

  dispose(): void {
    this.tracerGeometry.dispose();
    this.tracerMaterial.dispose();
    this.puffGeometry.dispose();
    for (const p of this.puffs) p.material.dispose();
  }
}
